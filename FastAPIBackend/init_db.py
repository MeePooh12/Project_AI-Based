# init_db.py
from sqlalchemy import create_engine
from contextlib import contextmanager
from sqlalchemy.orm import Session, sessionmaker, declarative_base
import os
from dotenv import load_dotenv

load_dotenv()

# ใช้ DATABASE_URL จาก environment หรือ SQLite เริ่มต้น
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("❌ DATABASE_URL not found in .env")

# Engine สำหรับฐานข้อมูล
engine = create_engine(
    DATABASE_URL,
    echo=False,            # เปิด True ถ้าต้องการ debug SQL
    pool_pre_ping=True,    # ป้องกัน connection timeout
    pool_size=10,          # จำนวน connection pool
    max_overflow=20        # scale ได้เวลามี load
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    future=True
)

Base = declarative_base()

@contextmanager
def get_db():
    db: Session = SessionLocal()
    try:
        yield db
        db.commit()
    except:
        db.rollback()
        raise
    finally:
        db.close()
