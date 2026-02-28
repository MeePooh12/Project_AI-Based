import React, { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import "./LoginPage.css";
import logo from "./assets/logo.svg";
import { LanguageContext } from "./Components/LanguageContext";
import { AuthContext } from "./Components/AuthContext";


export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false); // สถานะแสดงรหัส
  const [errorMessage, setErrorMessage] = useState("");
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { language, toggleLanguage } = useContext(LanguageContext);
  const { loginAsGuest } = useContext(AuthContext);

  console.log("Language context:", { language });
  const navigate = useNavigate();

  const t = {
    en: {
      title: "AI-BASED INVESTMENT RECOMMENDATION SYSTEM",
      email: "Email Address",
      password: "Password",
      remember: "Remember me",
      forgot: "Forgot Password?",
      signin: "Sign in",
      signup: "Sign up",
      loading: "LOADING...",
    },
    th: {
      title: "ระบบแนะนำการลงทุนด้วย AI",
      email: "อีเมล",
      password: "รหัสผ่าน",
      remember: "จดจำฉันไว้",
      forgot: "ลืมรหัสผ่าน?",
      signin: "เข้าสู่ระบบ",
      signup: "สมัครสมาชิก",
      loading: "กำลังโหลด...",
    },
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");
    setIsLoading(true);
    console.log("handleSubmit ถูกเรียกแล้ว"); // log แรกสุด เพื่อเช็คว่าฟังก์ชันทำงานไหม

    try {
      console.log("เริ่ม fetch ไป backend...");

      const response = await fetch("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      console.log("fetch เสร็จแล้ว status:", response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error("Error from backend:", errorData);
        alert(errorData.error || "Login ล้มเหลว");
        return;
      }

      console.log("response OK กำลัง parse JSON...");

      const data = await response.json();
      console.log("Login success:", data); // ควรเห็น token ที่นี่

      // เก็บ token
      localStorage.setItem("token", data.token);
      console.log(
        "Token ถูกเก็บเรียบร้อย:",
        data.token.substring(0, 20) + "...",
      );

      setTimeout(() => {
        console.log("หน่วงเวลาเสร็จ → กำลัง redirect ไป /search");
        navigate("/search", { replace: true });
      }, 500);

      setIsLoading(false);
      navigate("/search");
    } catch (err) {
      console.error("Login fetch error:", err);
      setErrorMessage("เกิดข้อผิดพลาด: " + err.message);
      setIsLoading(false);
    }
  };

  useEffect(() => {
    document.body.style.overflow = "hidden"; // ล็อค scroll
    return () => {
      document.body.style.overflow = "auto"; // ปลดล็อคเมื่อออกจากหน้า
    };
  }, []);

  useEffect(() => {
    const savedEmail = localStorage.getItem("rememberedEmail");
    if (savedEmail) {
      setEmail(savedEmail);
      setRemember(true);
    }
  }, []);

  useEffect(() => {
    console.log("isLoading เปลี่ยนเป็น:", isLoading);
  }, [isLoading]);

  return (
    <div className="login-container">
      <div className="login-left">
        <div className="logo-circle">
          <img src={logo} alt="Logo" className="logo-img" />
        </div>
      </div>

      <div className="login-right">
        <div className="login-form">
          <h3>ระบบแนะนำการลงทุนด้วย AI</h3>
          <img src="ai.svg" alt="Logo" className="logo-top" />
          <form onSubmit={handleSubmit}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t[language]?.email || t.en.email}
              required
            />
            {emailError && <p className="error-message">{emailError}</p>}

            <div className="password-wrapper">
              <input
                type={showPassword ? "text" : "password"} // เปลี่ยน type ตาม showPassword
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t[language]?.password || t.en.password}
                required
              ></input>
              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowPassword(!showPassword)}
              ></button>
            </div>
            {passwordError && <p className="error-message">{passwordError}</p>}

            <div className="login-options">
              <label>
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={() => setRemember(!remember)}
                />
                {t[language]?.remember || t.en.remember}
              </label>
              <span
                className="forgot"
                onClick={() => navigate("/forgot-password")}
                style={{ cursor: "pointer", color: "#3b82f6" }}
              >
                {t[language]?.forgot}
              </span>
            </div>

            <button type="submit" className="btn-login">
              {t[language]?.signin || t.en.signin}
            </button>
            <button
              type="button"
              className="register-link"
              onClick={() => {
                console.log("กด Sign up → onClick ถูกเรียกจริง");
                alert("ปุ่ม Sign up ถูกกด! กำลังไป register");
                navigate("/register", { replace: true });
              }}
            >
              {t[language]?.signup || t.en.signup}
            </button>
            <button
              type="button"
              className="guest-btn"
              onClick={() => {
                loginAsGuest();
                navigate("/search");
              }}
            >
              เข้าใช้งานแบบ Guest
            </button>
          </form>
        </div>
      </div>

      <AnimatePresence>
        {isLoading && (
          <motion.div 
          className="loading-content">
            <img src={logo} alt="Logo" className="loading-logo" />
            <div className="loading-bar">
              <div className="loading-progress"></div>
            </div>
            <p className="loading-text">{t[language]?.loading || t.en.loading}</p>
        </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
