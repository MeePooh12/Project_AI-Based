from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os
from dotenv import load_dotenv

load_dotenv()

# 📌 อ่าน DATABASE_URL จาก .env (ถ้าไม่มีให้ใช้ SQLite ชั่วคราว)
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./database.db")

# 📌 ถ้าเป็น SQLite → ต้องใช้ connect_args
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        pool_pre_ping=True
    )
else:
    # 📌 PostgreSQL (หรือฐานข้อมูลอื่น) ใช้ pool ให้เสถียร
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,   # ป้องกัน connection ตาย
        pool_size=10,
        max_overflow=20,
        future=True
    )

# 📌 SessionLocal สำหรับ FastAPI
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

# 📌 Base Model
Base = declarative_base()

# 📌 Dependency สำหรับ FastAPI
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()