import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.resolve()))

from datetime import datetime, timezone
from sqlmodel import select
import math
from contextlib import contextmanager

import yfinance as yf
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

# ใช้งาน session จาก init_db (รองรับ PostgreSQL)
from init_db import SessionLocal, engine, Base  # ใช้ SessionLocal โดยตรง
from models import Stock, Price, News
from sentiment import score_text

# ---------- สร้างตารางอัตโนมัติ ----------
Base.metadata.create_all(bind=engine)

@contextmanager
def get_db_cm():
    """Context manager สำหรับ SQLAlchemy session"""
    session = SessionLocal()
    try:
        yield session
        session.commit()  # commit หลังปิด context
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

# ---------- Helper Functions ----------
def _safe_str(val, default="Unknown"):
    if val is None or str(val).strip() == "":
        return default
    return str(val).strip()

def _safe_datetime(val=None):
    if isinstance(val, datetime):
        if val.tzinfo is None:
            return val.replace(tzinfo=timezone.utc)
        return val.astimezone(timezone.utc)
    return datetime.now(timezone.utc)

def _safe_float(x, default=0.0):
    try:
        if x is None:
            return default
        if isinstance(x, float) and math.isnan(x):
            return default
        return float(x)
    except Exception:
        return default

# ---------- Main fetch function ----------
def fetch_and_store(tickers: list[str]):
    """
    ดึงราคา 1 ชั่วโมงย้อนหลัง 7 วัน + ข่าว จาก Yahoo Finance แล้วบันทึกลง PostgreSQL
    รองรับการล้าง NULL อัตโนมัติ และ symbol ที่มี . / -
    """
    with get_db_cm() as session:
        for t in tickers:
            symbol = (t or "").upper()
            if not symbol:
                continue

            # ✅ แปลง symbol สำหรับ Yahoo Finance
            yf_symbol = symbol.replace(".", "-").replace("/", "-")

            print(f"📊 Fetching data for: {symbol} -> {yf_symbol}")
            ticker = yf.Ticker(yf_symbol)

            # -------- Stock upsert --------
            try:
                info = getattr(ticker, "info", {}) or {}
                name = info.get("shortName") or info.get("longName") or symbol
            except Exception:
                name = symbol

            name = _safe_str(name, symbol)
            now_utc = datetime.now(timezone.utc)

            stock = session.execute(
                select(Stock).where(Stock.ticker == symbol)
            ).scalar_one_or_none()

            if stock is None:
                stock = Stock(ticker=symbol, name=name or symbol)
                session.add(stock)
            else:
                # วิธีที่ถูกต้องใน SQLModel ใหม่
                stock = stock.model_copy(update={
                    "name": name or stock.name or symbol,
                    "last_updated": datetime.now(timezone.utc)
                })

            # -------- Price (7d, 1h) --------
            try:
                hist = ticker.history(period="15d", interval="1h", auto_adjust=True)
            except Exception:
                hist = None

            if hist is not None and not hist.empty:
                hist = hist.reset_index()
                price_rows = []

                for _, row in hist.iterrows():
                    ts = row.get("Datetime") or row.get("Date")
                    if ts is None:
                        continue

                    ts = _safe_datetime(ts)

                    exists = session.execute(
                        select(Price).where(
                            Price.ticker == symbol,
                            Price.last_updated == ts,
                        )
                    ).scalar_one_or_none()

                    if exists:
                        continue

                    price_rows.append(
                        Price(
                            ticker=symbol,
                            name=name,
                            last_updated=ts,
                            open=_safe_float(row.get("Open")),
                            high=_safe_float(row.get("High")),
                            low=_safe_float(row.get("Low")),
                            close=_safe_float(row.get("Close")),
                            volume=int(_safe_float(row.get("Volume"), 0)),
                        )
                    )

                if price_rows:
                    session.add_all(price_rows)
                    session.commit()

            # -------- News + sentiment --------
            try:
                news_list = getattr(ticker, "news", []) or []
            except Exception:
                news_list = []

            if news_list:
                to_add = []
                for n in news_list:
                    title = _safe_str(n.get("title"), "")
                    if not title:
                        continue

                    url = _safe_str(n.get("link") or n.get("url"), "")
                    ts_pub = n.get("providerPublishTime") or 0

                    try:
                        published_at = (
                            datetime.fromtimestamp(int(ts_pub), tz=timezone.utc)
                            if ts_pub else _safe_datetime()
                        )
                    except Exception:
                        published_at = _safe_datetime()

                    dup = session.execute(
                        select(News).where(
                            News.ticker == symbol,
                            News.url == url,
                            News.published_at == published_at,
                        )
                    ).scalar_one_or_none()
                    if dup:
                        continue

                    summary = n.get("summary") or ""
                    try:
                        sent = score_text(f"{title}. {summary}")
                    except Exception:
                        sent = 0.0

                    to_add.append(
                        News(
                            ticker=symbol,
                            title=title[:500],
                            summary=summary[:2000] if summary else "",
                            url=url,
                            published_at=published_at,
                            sentiment=sent,
                        )
                    )

                if to_add:
                    session.add_all(to_add)
                    session.commit()

    print("fetch_and_store completed successfully on PostgreSQL.")