from __future__ import annotations
from datetime import datetime, timedelta
import math, threading, time, requests, pandas as pd, yfinance as yf, feedparser, logging
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from requests.adapters import HTTPAdapter, Retry
from fetcher_model import fetch_and_store
from transformers import pipeline

from dotenv import load_dotenv
import os

# =========================
# Config / Constants
# =========================
load_dotenv()

ALPHA_VANTAGE_API_KEY = os.getenv("ALPHA_VANTAGE_API_KEY")
NEWSAPI_KEY           = os.getenv("NEWSAPI_KEY")
MARKETAUX_API_KEY     = os.getenv("MARKETAUX_API_KEY")

CACHE_DURATION = timedelta(minutes=10)
TICKERS = ["NVDA","MSFT","AMZN","UNH","AMD","GOOGL","MU","TSM","NVO","META","BRK-A"]
cache_lock = threading.Lock()
cache: Dict[str, Dict[str, Any]] = {}

cache_lock = threading.Lock()
cache: Dict[str, Dict[str, Any]] = {}

# =========================
# LOGGING
# =========================
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
log = logging.getLogger("ai-stock")

# =========================
# Optional Risk Module
# =========================
try:
    # ต้องมีไฟล์ risk_classifier.py ที่มีฟังก์ชัน recommend_by_level(level, limit)
    from risk_model import recommend_by_level   # type: ignore
    HAS_RISK = True
except Exception:
    HAS_RISK = False
    def recommend_by_level(level: str, limit: int = 10):
        return []

# =========================
# App + CORS
# =========================
app = FastAPI(title="AI Stock Sentiment API", version="3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # ปรับ origin ตามจริง
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "FastAPI ทำงานแล้ว!"}

# =========================
# Sentiment Model (FinBERT)
# =========================
log.info("Loading FinBERT model for sentiment analysis...")
try:
    sentiment_analyzer = pipeline("sentiment-analysis", model="ProsusAI/finbert")  # type: ignore
except Exception as e:
    log.error(f"FinBERT load error: {e}")
    sentiment_analyzer = lambda x: [{"label": "Neutral"} for _ in x]

# =========================
# Requests session (retry)
# =========================
session = requests.Session()
retries = Retry(total=3, backoff_factor=2, status_forcelist=[429, 502, 503, 504])
session.mount("https://", HTTPAdapter(max_retries=retries))

# =========================
# Helpers
# =========================
def safe_float(x):
    try:
        if x is None or (isinstance(x, float) and math.isnan(x)):
            return 0.0
        return float(x)
    except Exception:
        return 0.0

def _finbert_batch(titles: List[str]) -> List[str]:
    if not titles:
        return []
    try:
        outs = sentiment_analyzer(titles)
        return [o.get("label", "Neutral") for o in outs]
    except Exception as e:
        print(f"⚠️ FinBERT batch error: {e}")
        return ["Neutral"] * len(titles)

# =========================
# News Providers
# =========================
def get_alpha_news(symbol: str) -> List[Dict[str, Any]]:
    url = f"https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers={symbol}&apikey={ALPHA_VANTAGE_API_KEY}"
    try:
        res = session.get(url, timeout=8)
        if res.status_code != 200:
            return []
        data = res.json()
        feed = data.get("feed", []) or []
        if not feed:
            return []

        titles = [f.get("title", "")[:512] for f in feed if f.get("title")]
        sentiments = _finbert_batch(titles)

        news = []
        for i, item in enumerate(feed[:len(sentiments)]):
            try:
                date_str = item.get("time_published", "")
                date = datetime.strptime(date_str, "%Y%m%dT%H%M%S").strftime("%Y-%m-%d %H:%M")
            except Exception:
                date = "Unknown"
            news.append({
                "title": item.get("title"),
                "link": item.get("url", ""),
                "date": date,
                "sentiment": sentiments[i],
                "provider": item.get("source", "AlphaVantage"),
                "image": item.get("banner_image", "")
            })
        return news
    except Exception as e:
        log.warning(f"AlphaVantage error: {e}")
        return []

def get_yahoo_news_rss(symbol: str, limit=5):
    try:
        feed = feedparser.parse(f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={symbol}&region=US&lang=en-US")
        out = []
        for entry in feed.entries[:limit]:
            out.append({
                "title": entry.title,
                "link": entry.link,
                "date": getattr(entry, "published", datetime.now().strftime("%Y-%m-%d %H:%M")),
                "sentiment": "Neutral",
                "provider": "Yahoo Finance RSS",
                "image": ""
            })
        return out
    except Exception as e:
        log.warning(f"Yahoo RSS error: {e}")
        return []

@app.get("/rss/{symbol}")
def rss_endpoint(symbol: str):
    symbol = symbol.upper()
    try:
        news = get_yahoo_news_rss(symbol)
        return {"symbol": symbol, "news": news}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

def get_marketaux_news(symbol: str, limit=5, days_back=7):
    try:
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days_back)
        url = (
            f"https://api.marketaux.com/v1/news/all?symbols={symbol}"
            f"&language=en&limit={limit}&filter_entities=true"
            f"&published_after={start_date:%Y-%m-%dT%H:%M:%S}"
            f"&published_before={end_date:%Y-%m-%dT%H:%M:%S}"
            f"&api_token={MARKETAUX_API_KEY}"
        )
        res = session.get(url, timeout=8)
        data = res.json()
        articles = data.get("data") or []
        if not articles:
            return []

        titles = [a.get("title", "")[:512] for a in articles if a.get("title")]
        sentiments = _finbert_batch(titles)

        out = []
        for i, a in enumerate(articles):
            published = a.get("published_at", "Unknown")
            try:
                published = datetime.strptime(published[:19], "%Y-%m-%dT%H:%M:%S").strftime("%Y-%m-%d %H:%M")
            except Exception:
                pass
            out.append({
                "title": a.get("title", "Untitled"),
                "link": a.get("url", ""),
                "date": published,
                "sentiment": sentiments[i] if i < len(sentiments) else "Neutral",
                "provider": a.get("source", "MarketAux"),
                "image": a.get("image_url", "")
            })
        return out
    except Exception as e:
        print(f"MarketAux API error: {e}")
        return []

def get_newsapi_news_batch(symbols: List[str], limit_per_symbol=5, days_back=14):
    out = []
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=days_back)
    for sym in symbols:
        try:
            params = {
                "q": sym,
                "pageSize": limit_per_symbol,
                "sortBy": "publishedAt",
                "language": "en",
                "from": start_date.strftime("%Y-%m-%d"),
                "to": end_date.strftime("%Y-%m-%d"),
                "apiKey": NEWSAPI_KEY
            }
            res = session.get("https://newsapi.org/v2/everything", params=params, timeout=8)
            data = res.json()
            if data.get("status") != "ok" or not data.get("articles"):
                raise ValueError("Empty news")
            articles = data["articles"]
            titles = [a.get("title", "")[:512] for a in articles]
            sentiments = _finbert_batch(titles)
            news = []
            for i, a in enumerate(articles):
                published = a.get("publishedAt", "Unknown")
                try:
                    published = datetime.strptime(published[:19], "%Y-%m-%dT%H:%M:%S").strftime("%Y-%m-%d %H:%M")
                except Exception:
                    pass
                news.append({
                    "title": a.get("title", "Untitled"),
                    "link": a.get("url", ""),
                    "date": published,
                    "sentiment": sentiments[i],
                    "provider": a.get("source", {}).get("name", "NewsAPI"),
                    "image": a.get("urlToImage", "")
                })
            out.append({"symbol": sym, "news": news})
        except Exception as e:
            log.warning(f"NewsAPI fallback for {sym}: {e}")
            alt = get_marketaux_news(sym) or get_alpha_news(sym) or get_yahoo_news_rss(sym)
            out.append({"symbol": sym, "news": alt})
    return out

# =========================
# Stock (Yahoo Finance)
# =========================
def get_stock_data(symbol: str):
    try:
        ticker = yf.Ticker(symbol)
        info = ticker.info or {}
        name = info.get("longName", info.get("shortName", symbol))
        price = safe_float(info.get("regularMarketPrice"))
        hist = ticker.history(period="2mo")
        history = [{
            "date": d.strftime("%Y-%m-%d"), # type: ignore
            "open": safe_float(r["Open"]),
            "high": safe_float(r["High"]),
            "low": safe_float(r["Low"]),
            "close": safe_float(r["Close"]),
            "volume": safe_float(r["Volume"])
        } for d, r in hist.iterrows()]
        return {"name": name, "price": price, "history": history}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"yfinance error: {e}")

# =========================
# Target Price + Recommendation (Self-contained)
# =========================
# --- REPLACE this function in main.py ---

def compute_recommendation(symbol: str,
                           window_days: int = 7,
                           news_path: str = "../news_clean_pipeline/data/clean/news_clean.csv",
                           prices_path: str = "../yahoo_finance_clean_pipeline/data/clean/clean_long.csv") -> Dict[str, Any]:
    """
    รุ่นปรับปรุง:
    - current_price: ใช้ yfinance (สอดคล้องกับ /stock)
    - sentiment: ใช้จากไฟล์ clean; ถ้าไม่มี → ดึงข่าวสด (NewsAPI/MarketAux/Yahoo RSS) + FinBERT
    - trend: ใช้ EMA10/EMA20 จากราคาช่วง 90 วัน
    - target_diff_expected = a*sentiment + b*trend (bounded)
    - confidence: ขึ้นกับจำนวนข่าว + ความแรงของสัญญาณ
    - รองรับกรณีไม่มีไฟล์ news_clean.csv (fallback ไปดึงข่าวสด + FinBERT)
    - เพิ่มการตรวจไฟล์ก่อนอ่าน
    - โครงสร้างเดิมไม่เปลี่ยน
    """
    sym = symbol.upper()

    # -------- current price (สดจาก Yahoo ให้ตรงกับ /stock) --------
    y = yf.Ticker(sym)
    info = y.info
    current_price = safe_float(info.get("regularMarketPrice"))
    if not current_price:
        # fallback: ราคาปิดล่าสุดจาก CSV (ถ้ามี)
        try:
            prices_df = pd.read_csv(prices_path)
            p = prices_df[prices_df["Symbol"].str.upper() == sym].sort_values("Date")
            if not p.empty:
                current_price = float(p["Close"].iloc[-1])
        except Exception as e:
            print(f"⚠️ price fallback error: {e}")
    if not current_price:
        return {"error": f"no price data for {sym}"}

    # -------- sentiment from clean file (fallback → live news + FinBERT) --------
    avg_sent, news_count = 0.0, 0
    try:
        news_df = pd.read_csv(news_path)
        news_df["published_at"] = pd.to_datetime(news_df["published_at"], errors="coerce", utc=True)
        cutoff = pd.Timestamp.utcnow().tz_localize("UTC") - pd.Timedelta(days=window_days)
        n = news_df[(news_df["tickers"].str.contains(sym, case=False, na=False)) &
                    (news_df["published_at"] >= cutoff)]
        if not n.empty and "sentiment" in n.columns:
            avg_sent = float(pd.to_numeric(n["sentiment"], errors="coerce").fillna(0.0).mean())
            news_count = int(len(n))
    except Exception as e:
        print(f"⚠️ read news csv error: {e}")

    # fallback → live news + FinBERT
    if news_count == 0:
        try:
            live = get_newsapi_news_batch([sym], limit_per_symbol=10, days_back=window_days)[0]["news"]
            if not live:
                live = get_marketaux_news(sym, limit=10, days_back=window_days) \
                    or get_alpha_news(sym) \
                    or get_yahoo_news_rss(sym, limit=10)
            if live:
                def score(lbl: str) -> float:
                    s = (lbl or "Neutral").lower()
                    if "positive" in s: return 1.0
                    if "negative" in s: return -1.0
                    return 0.0
                labels = [x.get("sentiment", "Neutral") for x in live]
                scores = [score(l) for l in labels]
                avg_sent = float(pd.Series(scores).mean())
                news_count = len(live)
        except Exception as e:
            print(f"⚠️ live news fallback error: {e}")

    # -------- trend: EMA10 vs EMA20 จากราคา 90 วัน --------
    try:
        hist = y.history(period="3mo")  # ~ 60-70 วันทำการ
        closes = hist["Close"].astype(float)
        ema10 = closes.ewm(span=10, adjust=False).mean()
        ema20 = closes.ewm(span=20, adjust=False).mean()
        trend = float((ema10.iloc[-1] - ema20.iloc[-1]) / max(1e-9, ema20.iloc[-1]))
    except Exception as e:
        print(f"⚠️ trend calc error: {e}")
        trend = 0.0

    # -------- blend signals → expected target diff --------
    # น้ำหนัก: sentiment 60%, trend 40%  (ปรับได้)
    a, b = 0.6, 0.4
    target_diff_expected = a * avg_sent + b * trend
    # จำกัดความสุดโต่งไว้ในกรอบ [-30%, +30%]
    target_diff_expected = float(max(-0.30, min(0.30, target_diff_expected)))

    target_mean = current_price * (1 + target_diff_expected)
    target_high = target_mean * 1.10
    target_low  = target_mean * 0.90

    # -------- map เป็นคำแนะนำ --------
    # ใช้สัญญาณสองตัวร่วมกัน: target_diff_expected และ avg_sent
    td = target_diff_expected
    if avg_sent >= 0.25 and td >= 0.12:
        reco = "Strong Buy"
    elif avg_sent >= 0.10 and td >= 0.05:
        reco = "Buy"
    elif -0.05 < td < 0.05:
        reco = "Hold"
    elif avg_sent <= -0.10 and td <= -0.05:
        reco = "Sell"
    else:
        # ถ้า sentiment ขัดแย้งกับ trend ให้ลดความรุนแรงของคำแนะนำ
        if td > 0.05:
            reco = "Buy"
        elif td < -0.05:
            reco = "Sell"
        else:
            reco = "Hold"

    # -------- confidence --------
    # จากจำนวนข่าว (อิ่มตัวที่ ~10 ชิ้น) และความแรงสัญญาณ
    news_factor = min(1.0, news_count / 10.0)
    signal_strength = min(1.0, abs(td))  # 0..1
    confidence = round(min(1.0, 0.2 + 0.6 * news_factor + 0.2 * signal_strength), 2)

    return {
        "symbol": sym,
        "current_price": round(current_price, 2),
        "target_price_mean": round(target_mean, 2),
        "target_price_high": round(target_high, 2),
        "target_price_low": round(target_low, 2),
        "sentiment_avg": round(avg_sent, 3),
        "trend": round(trend, 3),
        "expected_diff": round(td, 3),
        "recommendation": reco,
        "confidence": confidence,
        "window_days": window_days,
        "news_count": int(news_count),
    }


# =========================
# Background Cache (news)
# =========================
def background_fetch(interval=600):
    while True:
        log.info("Background: refreshing cache...")

        with cache_lock:
            symbols_to_refresh = list(cache.keys())  # ดึงหุ้นที่เคยค้น

        for sym in symbols_to_refresh:
            try:
                data = get_alpha_news(sym)
                if data:
                    with cache_lock:
                        cache[sym]["time"] = datetime.now()
                        cache[sym]["data"]["news"] = data
            except Exception as e:
                log.warning(f"Cache update failed for {sym}: {e}")

        time.sleep(interval)

threading.Thread(target=background_fetch, daemon=True).start()

# =========================
# Endpoints
# =========================
@app.get("/health")
def health():
    return {"ok": True, "risk_module": HAS_RISK}

# ข่าวหลายตัว
@app.get("/news")
def news_endpoint(symbols: str, days_back: int = 7):
    syms = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not syms:
        raise HTTPException(status_code=400, detail="No valid symbols")
    return get_newsapi_news_batch(syms, 10, days_back)

# ข้อมูลหุ้นเดี่ยว + ข่าว
@app.get("/stock/{symbol}")
def stock_endpoint(symbol: str):
    symbol = symbol.upper()

    # =============== CACHE CHECK ===============
    with cache_lock:
        if symbol in cache:
            item = cache[symbol]
            if datetime.now() - item["time"] < CACHE_DURATION:
                return item["data"]

    # =============== LIVE FETCH ===============
    try:
        stock = get_stock_data(symbol)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # เพิ่มข่าวแบบสดทันที (NewsAPI + fallback)
    try:
        news_batch = get_newsapi_news_batch([symbol], 10, 7)
        news = news_batch[0]["news"]
    except Exception:
        news = get_marketaux_news(symbol, limit=10) \
            or get_alpha_news(symbol) \
            or get_yahoo_news_rss(symbol)

    data = {
        "symbol": symbol,
        "name": stock["name"],
        "price": stock["price"],
        "history": stock["history"],
        "news": news,
    }

    # =============== CACHE SAVE ===============
    with cache_lock:
        cache[symbol] = {"time": datetime.now(), "data": data}

    return data

# ✅ แนะนำหุ้นตามระดับความเสี่ยง (LOW / MEDIUM / HIGH)
@app.get("/risk/recommend")
def risk_recommend(
    level: str = Query("LOW", description="LOW | MEDIUM | HIGH"),
    limit: int = Query(10, ge=1, le=50)
):
    level_up = level.upper()
    if level_up not in {"LOW","MEDIUM","HIGH"}:
        raise HTTPException(status_code=400, detail="level must be LOW|MEDIUM|HIGH")
    try:
        items = recommend_by_level(level=level_up, limit=limit)  # type: ignore
        return {"level": level_up, "items": items, "risk_module": HAS_RISK}
    except Exception as e:
        return {"level": level_up, "items": [], "risk_module": HAS_RISK, "error": str(e)}

# ✅ Target Price + Investment Recommendation
@app.post("/recommend")
def recommend_endpoint(
    symbol: str = Query(..., description="Stock symbol, e.g. MU"),
    window_days: int = Query(7, ge=1, le=60)
):
    out = compute_recommendation(symbol, window_days=window_days)
    if "error" in out:
        raise HTTPException(status_code=400, detail=out["error"])
    return out

# Run local (optional)
if __name__ == "__main__":
    fetch_and_store(TICKERS)
    print("Data fetched, cleaned, and stored successfully.")

