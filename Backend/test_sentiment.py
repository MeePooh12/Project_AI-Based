from FastAPIBackend.sentiment import score_text

print("✅ ทดสอบ Sentiment Model")
print("Apple is doing great! →", score_text("Apple is doing great!"))
print("This is the worst product ever. →", score_text("This is the worst product ever."))
