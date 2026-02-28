from transformers import AutoTokenizer, AutoModelForSequenceClassification, pipeline

_sentiment_pipeline = None

def get_sentiment_pipeline():
    global _sentiment_pipeline
    if _sentiment_pipeline is None:
        # โหลด FinBERT
        model_name = "yiyanghkust/finbert-tone"
        _sentiment_pipeline = pipeline(task="sentiment-analysis",model=model_name,tokenizer=model_name) # type: ignore
    return _sentiment_pipeline

def score_text(text: str) -> float | None:
    """
    คืนค่า sentiment score:
    Positive -> +score
    Negative -> -score
    Neutral -> None
    """
    pipe = get_sentiment_pipeline()
    # FinBERT รองรับ input ยาวน้อยกว่า 512 token
    result = pipe(text[:512])[0]
    
    label = result["label"].upper()
    score = result["score"]
    
    if label == "POSITIVE":
        return score
    elif label == "NEGATIVE":
        return -score
    else:  # NEUTRAL
        return None