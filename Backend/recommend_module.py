import pandas as pd
import numpy as np
from datetime import datetime, timedelta

def recommend(stock_symbol, news_path, prices_path, window_days=7):
    news = pd.read_csv(news_path)
    prices = pd.read_csv(prices_path)
    prices = prices[prices["Symbol"].str.upper() == stock_symbol.upper()].sort_values("Date")

    # --------------------------
    # 1️⃣ ดึงราคาล่าสุด
    # --------------------------
    current_price = float(prices["Close"].iloc[-1])

    # --------------------------
    # 2️⃣ ดึง sentiment ข่าวช่วงล่าสุด
    # --------------------------
    news["published_at"] = pd.to_datetime(news["published_at"], errors="coerce")
    cutoff = datetime.utcnow() - timedelta(days=window_days)
    subset = news[(news["tickers"].str.contains(stock_symbol, case=False, na=False)) &
                  (news["published_at"] >= cutoff)]
    avg_sentiment = subset["sentiment"].mean() if not subset.empty else 0.0

    # --------------------------
    # 3️⃣ คำนวณราคาเป้าหมาย (target)
    # --------------------------
    k = 0.05
    target_price_mean = current_price * (1 + k * avg_sentiment)
    target_price_high = target_price_mean * 1.1
    target_price_low = target_price_mean * 0.9

    target_diff = (target_price_mean - current_price) / current_price

    # --------------------------
    # 4️⃣ แปลงเป็นคำแนะนำ
    # --------------------------
    if avg_sentiment > 0.2 and target_diff > 0.1:
        reco = "Strong Buy"
    elif avg_sentiment > 0.1 and target_diff > 0.05:
        reco = "Buy"
    elif abs(target_diff) <= 0.05:
        reco = "Hold"
    elif avg_sentiment < -0.1 and target_diff < -0.05:
        reco = "Sell"
    else:
        reco = "Strong Sell"

    confidence = round(min(1, abs(avg_sentiment) + abs(target_diff)), 2)

    return {
        "symbol": stock_symbol,
        "current_price": round(current_price, 2),
        "target_price_mean": round(target_price_mean, 2),
        "target_price_high": round(target_price_high, 2),
        "target_price_low": round(target_price_low, 2),
        "sentiment_avg": round(avg_sentiment, 2),
        "recommendation": reco,
        "confidence": confidence
    }