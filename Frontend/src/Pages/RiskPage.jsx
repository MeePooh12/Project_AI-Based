import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "./RiskPage.css"; // สร้าง CSS ตามต้องการ

const API_BASE = import.meta.env?.VITE_API_BASE || "http://localhost:8000";

export default function RiskPage() {
  const navigate = useNavigate();

  const [selectedRisk, setSelectedRisk] = useState(localStorage.getItem("selectedRisk") || "");
  const [riskGroups, setRiskGroups] = useState({ low: [], medium: [], high: [] });
  const [recs, setRecs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const handleRiskClick = (risk) => {
    const r = (risk || "").toLowerCase();
    setSelectedRisk(r);
    localStorage.setItem("selectedRisk", r);
  };

  const handleBack = () => navigate("/search");

  // ตรวจสอบ login
  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      navigate("/login");
    }
  }, [navigate]);

  // fetch แนะนำหุ้นตาม selectedRisk
  useEffect(() => {
    if (!selectedRisk) return;

    const fetchRecs = async () => {
      try {
        setLoading(true);
        setErr("");
        setRecs([]);

        const level = selectedRisk.toUpperCase();
        const res = await fetch(`${API_BASE}/risk/recommend?level=${level}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (data && Array.isArray(data.items)) {
          setRecs(data.items);
        } else {
          setErr("ไม่มีข้อมูลแนะนำหุ้นในระดับนี้");
        }
      } catch (e) {
        console.error("fetch recommend error:", e);
        setErr("เรียกข้อมูลแนะนำไม่สำเร็จ");
      } finally {
        setLoading(false);
      }
    };

    fetchRecs();
  }, [selectedRisk]);

  useEffect(() => {
    const fetchAllGroups = async () => {
      try {
        setLoading(true);
        const levels = ["LOW", "MEDIUM", "HIGH"];
        const groups = { low: [], medium: [], high: [] };

        for (const lv of levels) {
          const res = await fetch(`${API_BASE}/risk/recommend?level=${lv}`);
          if (!res.ok) continue;
          const data = await res.json();
          groups[lv.toLowerCase()] = data.items?.map(i => i.Symbol) || [];
        }
        setRiskGroups(groups);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    fetchAllGroups();
  }, []);

  return (
    <div className="account-page relative min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex flex-col items-center justify-center p-6 transition-all duration-500">
      <div className="back-button">
        <button onClick={handleBack} className="back-btn">Back</button>
      </div>

      <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-100 flex items-center gap-2">
        ระดับความเสี่ยง
      </h2>

      <div className="risk-card">
        <p className="text-xl font-semibold mb-4 text-gray-800 font-inter">
          เลือกความเสี่ยง:{" "}
          <span className="font-bold text-blue-600">
            {selectedRisk ? selectedRisk.toUpperCase() : "ยังไม่ได้เลือก"}
          </span>
        </p>

        <div className="risk-buttons">
          {["low", "medium", "high"].map(risk => (
            <button
              key={risk}
              className={`risk-button ${risk} ${selectedRisk === risk ? "active" : ""}`}
              onClick={() => handleRiskClick(risk)}
            >
              {risk.charAt(0).toUpperCase() + risk.slice(1)}
            </button>
          ))}
        </div>
       </div>

        {/* รายการแนะนำหุ้นตามความเสี่ยง */}
        <div className="risk-list mt-4 w-full max-w-4xl">
          {loading && <div className="hint">Loading...</div>}
          {err && !loading && <div className="error">{err}</div>}

          {!loading && !err && recs.length > 0 && (
            <table className="risk-table">
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Level</th>
                  <th>Risk Score</th>
                  <th>Vol(90d)</th>
                  <th>MaxDD(1y)</th>
                  <th>Ret(30d)</th>
                </tr>
              </thead>
              <tbody>
                {recs.map((r) => {
                  const sym = r.Symbol || r.symbol;
                  return (
                    <tr
                      key={sym}
                      className="hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      {/* Symbol clickable */}
                      <td>
                        <a
                          href={`/stock/${sym}`}
                          className="risk-symbol"
                        >
                          {sym}
                        </a>
                      </td>
                      <td>{r.risk_label}</td>
                      <td>{Number(r.risk_score ?? 0).toFixed(2)}</td>
                      <td>{Number(r.vol90 ?? 0).toFixed(2)}</td>
                      <td>{r.mdd1y != null ? `${(Number(r.mdd1y) * 100).toFixed(1)}%` : "-"}</td>
                      <td>{r.ret30 != null ? `${(Number(r.ret30) * 100).toFixed(1)}%` : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {!loading && !err && recs.length === 0 && (
            <div className="hint">No stock list</div>
          )}
        </div>

    </div>
  );
}
