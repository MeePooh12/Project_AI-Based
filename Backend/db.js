import pkg from 'pg';
const { Pool } = pkg;

export const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE, // 👈 ใช้ตัวนี้
  port: process.env.DB_PORT,
});
