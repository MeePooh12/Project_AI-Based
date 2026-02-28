from FastAPIBackend.fetcher_model import fetch_and_store

# หุ้นที่ต้องการดึงข้อมูล
TICKERS = [
    "NVDA", "MSFT", "AMZN", "UNH", "AMD",
    "GOOGL", "MU", "TSM", "NVO", "META", "BRK-A"
]

if __name__ == "__main__":
    print("Starting data fetch job...")

    try:
        fetch_and_store(TICKERS)
        print("Data fetched successfully (PostgreSQL).")

    except Exception as e:
        print("Error during fetch_and_store:", str(e))

