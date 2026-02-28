import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import pg from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import axios from "axios";
import Joi from "joi";
import sendVerificationEmail from "./utils/sendVerificationEmail.js";
import { Sequelize } from 'sequelize';

dotenv.config();

export const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: 'db',
    dialect: 'postgres',
    logging: false,
  }
);

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5000',
];

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests, please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 ชั่วโมง
  max: 5, // จำกัดสมัคร 5 ครั้งต่อ IP ต่อชั่วโมง
  message: { error: "สมัครสมาชิกเกินจำนวน กรุณารอ 1 ชั่วโมงแล้วลองใหม่" },
  standardHeaders: true,
  legacyHeaders: false,
});

const app = express();

app.set('trust proxy', 1);
app.use(globalLimiter);

/* ---------- CORS ---------- */
app.use(cors({
  origin: function (origin, callback) {
    console.log(`Incoming origin: ${origin || 'no-origin'}`);
    // อนุญาต request ที่ไม่มี origin (เช่น Postman, curl)
    if (!origin) return callback(null, true);

    // อนุญาต localhost และ ngrok ทุก subdomain
    const isAllowed =
      allowedOrigins.includes(origin) ||
      origin.endsWith('.ngrok-free.dev') ||
      origin.endsWith('.ngrok-free.app') ||
      /^https:\/\/[a-z0-9-]+\.ngrok-free\.(dev|app)$/.test(origin);
    
    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization','ngrok-skip-browser-warning']
}));

app.use(helmet());
app.use(express.json({ limit: "10kb" }));

/* ---------- Rate limiting ---------- */
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: "ส่งคำขอรีเซ็ตรหัสเกินจำนวน กรุณารอ 1 ชั่วโมงแล้วลองใหม่" },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.set('Retry-After', 3600); // header มาตรฐาน
    res.status(429).json({
      error: "Too many password reset attempts. Please try again in 1 hour.",
      retryAfter: 3600
    });
  },
});

const connectWithRetry = () => {
  sequelize.authenticate()
    .then(() => console.log('Connected to PostgreSQL'))
    .catch(err => {
      console.log('DB not ready, retry in 5s...');
      setTimeout(connectWithRetry, 5000);
    });
};

connectWithRetry();

/* ---------- Postgres pool ---------- */
const { Pool } = pg;
const db = new Pool({
  host: process.env.DB_HOST || "db",
  user: process.env.DB_USER || "postgres",
  port: process.env.DB_PORT || 5432,
  password: process.env.DB_PASSWORD || "290746",
  database: "registerdb",
});

/* quick DB check on start */
db.query("SELECT 1")
  .then(() => console.log("✔ DB connected"))
  .catch((err) => console.error("❌ DB connection error:", err.message));

/* ---------- Nodemailer ---------- */
const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST || "smtp.gmail.com",
  port: Number(process.env.MAIL_PORT || 465),
  secure: process.env.MAIL_SECURE === "true" || process.env.MAIL_PORT == 465,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/* ---------- Helpers & Schemas ---------- */
const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(8).max(128).required(),
  dob: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(), // YYYY-MM-DD ← แก้แล้ว
  recaptcha: Joi.string().allow("", null),
})

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
}).unknown(false);

/* ---------- Utility: verify reCAPTCHA v3 ---------- */
async function verifyRecaptcha(token) {
  const secret = process.env.RECAPTCHA_SECRET;
  if (!secret || process.env.NODE_ENV === 'development') {
    console.log('reCAPTCHA bypassed in development mode');
    return { success: true, score: 1.0 }; // ให้ผ่านเสมอ
  }
  try {
    const params = new URLSearchParams();
    params.append("secret", secret);
    params.append("response", token || "");
    const resp = await axios.post(
      "https://www.google.com/recaptcha/api/siteverify",
      params.toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 5000 }
    );
    return resp.data; // { success, score, ... }
  } catch (err) {
    console.error("recaptcha verify error:", err.message || err);
    throw new Error("reCAPTCHA verify failed");
  }
}

/* ---------- Routes ---------- */

// Ping
app.get("/ping", (req, res) => res.json({ message: "pong" }));

// Register
app.post("/api/register", signupLimiter, async (req, res) => {
  try {
    const { email, password, dob, recaptcha } = req.body;

    // verify recaptcha
    const rc = await verifyRecaptcha(recaptcha);
    if (!rc.success || rc.score < 0.5) {
      return res.status(400).json({ error: "reCAPTCHA failed" });
    }

    // check duplicate
    const exists = await db.query("SELECT * FROM users WHERE email=$1", [email]);
    if (exists.rows.length > 0) {
      return res.status(200).json({ message: "A verification email will be sent if this is a new account." });
    }

    // hash password
    const hashed = await bcrypt.hash(password, 10);

    // insert new unverified user
    await db.query(
      "INSERT INTO users (email, password, dob, is_verified) VALUES ($1,$2,$3,$4)",
      [email, hashed, dob, false]
    );

    // create verification token
    const token = jwt.sign(
      { email },
      process.env.MAIL_VERIFY_SECRET,
      { expiresIn: "15m" }
    );

    // send email
    const BASE_URL = process.env.BACKEND_PUBLIC_URL || "http://localhost:5000";
    const verifyURL = `${BASE_URL}/api/verify/${token}`;
    await sendVerificationEmail(email, verifyURL);

    return res.status(200).json({
      message: "Registration successful! Please check your email to verify your account."
    });

  } catch (err) {
    console.error("Register error:", err.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

// Login
app.post("/api/login", async (req, res) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) return res.status(400).json({ error: "Invalid input" });

    const { email, password } = value;
    const userRes = await db.query("SELECT id, email, password FROM users WHERE email=$1 LIMIT 1", [email]);
    if (userRes.rows.length === 0) return res.status(400).json({ error: "Invalid credentials" });

    const user = userRes.rows[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET || "dev_jwt_secret", {
      expiresIn: process.env.JWT_EXPIRE || "1d",
    });

    res.json({ message: "Login success", token });
  } catch (err) {
    console.error("Login Error:", err?.message || err);
    res.status(500).json({ error: "Server error" });
  }
});

// Verify Email
app.get("/api/verify/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const payload = jwt.verify(token, process.env.MAIL_VERIFY_SECRET);

    await db.query(
      "UPDATE users SET is_verified=true WHERE email=$1",
      [payload.email]
    );

    return res.send("Email verified successfully! You can now log in.");
  } catch (err) {
    return res.status(400).send("Invalid or expired verification link.");
  }
});

// Forgot password (send reset token)
app.post("/api/forgot-password", forgotPasswordLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });

    const userRes = await db.query("SELECT id FROM users WHERE email=$1 LIMIT 1", [email]);
    if (userRes.rows.length === 0) {
      // respond generically
      return res.status(200).json({ message: "If this email exists, a reset link will be sent." });
    }

    const token = jwt.sign({ email }, process.env.JWT_SECRET || "dev_jwt_secret", { expiresIn: "15m" });
    const expireAt = new Date(Date.now() + 15 * 60 * 1000);

    await db.query("UPDATE users SET reset_token=$1, reset_expires=$2 WHERE email=$3", [token, expireAt, email]);

    const CLIENT_URL = process.env.FRONTEND_URL || "http://localhost:5173";
    const resetLink = `${CLIENT_URL}/reset-password?token=${token}`;

    const websiteName = process.env.WEBSITE_NAME || "AI Investment";

    const mailHtml = `
      <div style="font-family:Arial,sans-serif;color:#111">
        <h3>${websiteName} - Password Reset</h3>
        <p>คลิกปุ่มด้านล่างเพื่อรีเซ็ตรหัสผ่าน (ลิงก์หมดอายุ 15 นาที)</p>
        <a href="${resetLink}" style="display:inline-block;padding:10px 16px;background:#4F46E5;color:#fff;border-radius:6px;text-decoration:none;">Reset Password</a>
        <p>หากไม่ใช่คุณ ให้เพิกเฉยอีเมลนี้</p>
      </div>
    `;

    await transporter.sendMail({
      from: process.env.MAIL_FROM || process.env.MAIL_USER,
      to: email,
      subject: `${websiteName} - Password Reset`,
      html: mailHtml,
    });

    return res.json({ message: "If this email exists, a reset link will be sent." });
  } catch (err) {
    console.error("Forgot Password Error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.use((err, req, res, next) => {
  if (err.status === 429) {
    return res.status(429).json({
      error: "Too many requests. Please try again later.",
      retryAfter: err.retryAfter || 60
    });
  }
  next(err);
});

// Reset password
app.post("/api/reset-password", async (req, res) => {
  try {
    const { token, new_password } = req.body;
    if (!token || !new_password) return res.status(400).json({ error: "Token and new password required" });

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || "dev_jwt_secret");
    } catch {
      return res.status(400).json({ error: "Invalid or expired token" });
    }

    const userRes = await db.query("SELECT email, reset_expires, reset_token FROM users WHERE email=$1 LIMIT 1", [decoded.email]);
    if (userRes.rows.length === 0) return res.status(400).json({ error: "Invalid token" });

    const user = userRes.rows[0];
    if (!user.reset_token || user.reset_token !== token) return res.status(400).json({ error: "Invalid token" });
    if (new Date() > new Date(user.reset_expires)) return res.status(400).json({ error: "Token expired" });

    const hashed = await bcrypt.hash(new_password, Number(process.env.BCRYPT_ROUNDS || 10));
    await db.query("UPDATE users SET password=$1, reset_token=NULL, reset_expires=NULL WHERE email=$2", [hashed, decoded.email]);

    return res.json({ message: "Password updated successfully" });
  } catch (err) {
    console.error("Reset Password Error:", err?.message || err);
    return res.status(500).json({ error: "Server error" });
  }
});

/* ---------- Start server ---------- */
const PORT = Number(process.env.PORT || 5000);
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
}).on('error', (err) => {
  console.error('Server start error:', err.message);
  process.exit(1);
});
