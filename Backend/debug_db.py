from FastAPIBackend.init_db import engine, DB_PATH
from sqlalchemy import text

print("DB:", DB_PATH)
with engine.connect() as conn:
    for table in ["stock", "price", "news"]:
        try:
            cnt = conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
            print(table, "rows:", cnt)
        except Exception as e:
            print(table, "ERROR:", e)
