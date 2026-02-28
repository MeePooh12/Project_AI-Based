import React, { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { LanguageContext } from "../Components/LanguageContext";
import logo from "../assets/logo.svg";
import zxcvbn from "zxcvbn";
import "./RegisterPage.css";

export default function RegisterPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [dobDay, setDobDay] = useState("");
    const [dobMonth, setDobMonth] = useState("");
    const [dobYear, setDobYear] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState("");
    const [passwordScore, setPasswordScore] = useState(0);
    const navigate = useNavigate();
    const { language } = useContext(LanguageContext);

    const t = {
        en: {
            register:"Register", email:"Email", password:"Password", confirmpass:"Confirm Password", 
            alredy:"Already have an account ? Log in", confirm:"Confirm"
        },
        th: {
            register:"สมัครสมาชิก", email:"อีเมล", password:"รหัสผ่าน", confirmpass:"ยืนยันรหัสผ่าน", 
            alredy:"มีบัญชีอยู่แล้วใช่ไหม? เข้าสู่ระบบ", confirm:"ยืนยัน"
        },
    };

    const [honeypot, setHoneypot] = useState(""); // ถ้าบอทกรอก = บล็อก
    const [startTime, setStartTime] = useState(Date.now()); // ตรวจว่ามนุษย์ใช้เวลาไม่น้อยกว่า 3 วินาที
    
    useEffect(() => {
        setStartTime(Date.now()); // รีเซ็ตทุกครั้งที่เข้าเว็บ
    }, []);

    const validateEmail = (email) => /\S+@\S+\.\S+/.test(email);
    
    // 🆕 ฟังก์ชันตรวจสอบอายุ >= 18
    const isOver18 = (birthDate) => {
        const today = new Date();
        const dobDate = new Date(birthDate);
        let age = today.getFullYear() - dobDate.getFullYear();
        const m = today.getMonth() - dobDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) {
            age--;
        }

        return age >= 18;
    };

    const getPasswordStrength = (score) => {
        switch(score) {
            case 0: return { label: "แย่มาก", color: "#ff4d4f" };
            case 1: return { label: "แย่", color: "#ff7a45" };
            case 2: return { label: "พอใช้", color: "#f19f3aff" };
            case 3: return { label: "แข็งแรง", color: "#6dac49ff" };
            case 4: return { label: "แข็งแรงมาก", color: "#3ba108ff" };
            default: return { label: "", color: "#d9d9d9" };
        }
    };

    const days = Array.from({ length: 31 }, (_, i) => i + 1);
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 100 }, (_, i) => currentYear - i);

    const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Anti-bot checks
    if (honeypot !== "") {
        setError("การสมัครถูกปฏิเสธ (Bot Detected)");
        return;
    }

    const elapsed = (Date.now() - startTime) / 1000;
    if (elapsed < 3) {
        setError("การสมัครเร็วเกินไป กรุณาลองใหม่อีกครั้ง");
        return;
    }

    if (!validateEmail(email)) {
        setError("รูปแบบอีเมลไม่ถูกต้อง");
        return;
    }

    if (!dobDay || !dobMonth || !dobYear) {
        setError("กรุณากรอกวันเดือนปีเกิดให้ครบ");
        return;
    }

    const dob = `${dobYear}-${dobMonth.padStart(2, '0')}-${dobDay.padStart(2, '0')}`;

    if (!isOver18(dob)) {
        setError("คุณต้องมีอายุอย่างน้อย 18 ปี จึงจะสามารถสมัครได้");
        return;
    }

    if (password.length < 6) {
        setError("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
        return;
    }

    if (passwordScore < 3) {
        setError("รหัสผ่านต้องแข็งแรงระดับ 'แข็งแรง' ขึ้นไป");
        return;
    }

    if (password !== confirmPassword) {
        setError("รหัสผ่านไม่ตรงกัน");
        return;
    }

    try {
        const token = await window.grecaptcha.execute(
        "6Lc72B8sAAAAAPDSG1yY8RsQKvyqLyleDSh2wunz",
        { action: "register" }
        );

        const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
        const res = await fetch('http://localhost:5000/api/register', {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "69420"  // สำคัญสำหรับ ngrok
        },
        body: JSON.stringify({
            email,
            password,
            dob,
            recaptcha: token
          }),
          credentials: "include"
        });

        const data = await res.json();

        if (!res.ok) {
        // แยก error ให้ user-friendly มากขึ้น
        if (data.error?.includes("reCAPTCHA")) {
            setError("การตรวจสอบ reCAPTCHA ล้มเหลว กรุณาลองใหม่");
        } else if (data.error?.includes("email")) {
            setError("อีเมลนี้ถูกใช้ไปแล้วหรือรูปแบบไม่ถูกต้อง");
        } else {
            setError(data.error || "เกิดข้อผิดพลาดในการสมัครสมาชิก");
        }
        return;
    }

        // สมัครสำเร็จ → ไปหน้า verify
        navigate("/verify");

    } catch (err) {
        console.error("Register error:", err);
        setError("ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่ภายหลัง");
    }
};

    const handleBack = () => {
        console.log('กด Back → กำลังไป /login');
        setTimeout(() => {
            navigate("/login", { replace: true });
        }, 300);
        };

return (
    <>
        <div className="back-button">
          <button
            onClick={handleBack} className="back-btn">
            Back
          </button>
        </div>

    <div className="register-container">
            <img src={logo} alt="logo" className="logo-register" />
        
            <div className="register-form">
                <h3>สมัครสมาชิก</h3>
                <form onSubmit={handleSubmit}>
                    <input
                        type="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="Email"
                        required
                    />

                    {/* ช่องกรอกวันเกิดแบบ Dropdown */}
                    <div className="dob-select">
                        <p>เกิดวันที่</p>
                        <select value={dobDay} onChange={e => setDobDay(e.target.value)} required>
                            <option value="">วัน</option>
                            {days.map(d => (
                                <option key={d} value={d < 10 ? `0${d}` : d}>{d}</option>
                            ))}
                        </select>

                        <select value={dobMonth} onChange={e => setDobMonth(e.target.value)} required>
                            <option value="">เดือน</option>
                            {months.map(m => (
                                <option key={m} value={m < 10 ? `0${m}` : m}>{m}</option>
                            ))}
                        </select>

                        <select value={dobYear} onChange={e => setDobYear(e.target.value)} required>
                            <option value="">ปี</option>
                            {years.map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                    </div>

                    {/* Honeypot ป้องกันบอท (ซ่อนด้วย CSS) */}
                    <input
                        type="text"
                        value={honeypot}
                        onChange={e => setHoneypot(e.target.value)}
                        className="bot-field"
                        autoComplete="off"
                        tabIndex="-1"
                    />

                    <div className="password-wrapper">
                        <input
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={e => {
                                setPassword(e.target.value);
                                const result = zxcvbn(e.target.value);
                                setPasswordScore(result.score);
                            }}
                            placeholder="Password"
                            required
                        />
                    </div>

                    {/* แถบแสดง Password Strength */}
                    {password && (
                        <div className="password-strength">
                            <div
                                className="strength-bar"
                                style={{
                                    width: `${(passwordScore + 1) * 20}%`,
                                    backgroundColor: getPasswordStrength(passwordScore).color
                                }}
                            />
                            <p style={{ color: getPasswordStrength(passwordScore).color }}>
                                {getPasswordStrength(passwordScore).label}
                            </p>
                        </div>
                    )}

                    <div className="password-wrapper">
                        <input
                            type={showPassword ? "text" : "password"}
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            placeholder="Confirm Password"
                            required
                        />
                    </div>
                    {error && <p className="error">{error}</p>}
                    <button type="submit" className="btn-register">
                       ยืนยัน
                    </button>
                </form>
                <span 
                    className="goto-login" 
                    onClick={() => {
                        console.log('กดไปล็อกอิน → กำลัง navigate ไป /login');
                        navigate("/login", { replace: true });
                    }}
                    >
                    {t[language].alredy}
                </span>
            </div>
        </div>
     </>
    );
}