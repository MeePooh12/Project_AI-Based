from datetime import timedelta
from sqlalchemy import select
from FastAPIBackend.init_db import get_db   # ← ใช้ get_db ที่รองรับ PostgreSQL
from FastAPIBackend.models import Price
import pandas as pd


# ---------------------------------------------------------
# ดึงข้อมูลราคาปิดย้อนหลัง N วัน
# ---------------------------------------------------------
def _load_close_df(session, days_back=14):
    # ดึงราคา close ล่าสุด ~14 วันจากตาราง price
    q = select(Price)
    rows = session.scalars(select(Price)).all()
    if not rows:
        return pd.DataFrame(columns=["ticker","last_updated","close"])
    data = [
        {"ticker": r.ticker, "ts": r.last_updated, "close": r.close}
        for r in rows if r.last_updated and r.close is not None
    ]
    df = pd.DataFrame(data)
    if df.empty:
        return df

    df["ts"] = pd.to_datetime(df["ts"], errors="coerce")
    df = df.dropna(subset=["ts"])
    cutoff = df["ts"].max() - timedelta(days=days_back)
    return df[df["ts"] >= cutoff]

# ---------------------------------------------------------
# คำนวณระดับความเสี่ยง
# ---------------------------------------------------------
def _compute_risk(df):
    # df: ticker, ts, close
    if df.empty:
        return pd.DataFrame(columns=["Symbol","risk_label","risk_score","vol90","mdd1y","ret30"])
    df = df.sort_values(["ticker","ts"])
    # ผลตอบแทนชั่วโมง/วัน (ขึ้นกับที่บันทึกมา)
    df["ret"] = df.groupby("ticker")["close"].pct_change()
    vol = df.groupby("ticker")["ret"].std(ddof=0).fillna(0)  # ความผันผวน = std
    # max drawdown อย่างง่าย
    def mdd(s):
        roll = s.cummax()
        dd = s/roll - 1.0
        return dd.min()
    mdd1y = df.groupby("ticker")["close"].apply(mdd).fillna(0)
    # คะแนนความเสี่ยงง่ายๆ: 0.6*vol + 0.4*|mdd|
    score = (0.6*vol) + (0.4*(-mdd1y))
    uni = pd.DataFrame({
        "Symbol": vol.index,
        "risk_score": score.values,
        "vol90": vol.values,
        "mdd1y": mdd1y.values
    })
    # quantiles → LOW/MEDIUM/HIGH
    if len(uni) >= 3:
        q1 = uni["risk_score"].quantile(0.33)
        q2 = uni["risk_score"].quantile(0.66)
    else:
        q1 = uni["risk_score"].min()
        q2 = uni["risk_score"].max()
    def label(x):
        if x <= q1: return "LOW"
        if x >= q2: return "HIGH"
        return "MEDIUM"
    uni["risk_label"] = uni["risk_score"].apply(label)
    # ใส่ ret30 (ถ้าไม่มีข้อมูลพอจะได้ NaN)
    def trailing_ret(g, n=30):
        if len(g) < n: return None
        g = g.sort_values("ts").tail(n)
        return (g.iloc[-1]["close"] - g.iloc[0]["close"]) / g.iloc[0]["close"]
    ret30 = df.groupby("ticker").apply(trailing_ret).reset_index(name="ret30")
    uni = uni.merge(ret30.rename(columns={"ticker":"Symbol"}), on="Symbol", how="left")
    return uni

# ---------------------------------------------------------
# ให้คำแนะนำหุ้นตามระดับความเสี่ยง (LOW/MEDIUM/HIGH)
# ---------------------------------------------------------
def recommend_by_level(level: str, limit: int = 10):
    level = level.upper()
    with get_db() as session:
        df = _load_close_df(session, days_back=14)
        uni = _compute_risk(df)
        if uni.empty:
            return []
        out = uni[uni["risk_label"] == level] \
                .sort_values(["ret30","risk_score"], ascending=[False, False]) \
                .head(limit)
        # จัดรูปให้ FE ใช้งาน
        return [
            {"Symbol": r.Symbol,"risk_label": r.risk_label,
             "risk_score": float(r.risk_score if r.risk_score is not None else 0),"vol90": float(r.vol90 if r.vol90 is not None else 0),"mdd1y": float(r.mdd1y if r.mdd1y is not None else 0),"ret30": None if pd.isna(r.ret30) else float(r.ret30),} # type: ignore
            for r in out.itertuples(index=False)
        ]
