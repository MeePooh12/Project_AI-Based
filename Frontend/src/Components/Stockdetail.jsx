import React, { useRef, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Line } from "react-chartjs-2";
import { GiBull, GiBearFace } from "react-icons/gi";
import "./Stockdetail.css";
import {
  Chart as ChartJS,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";

ChartJS.register(
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
  Filler
);

export default function StockDetail() {
  const { symbol } = useParams();
  const navigate = useNavigate();

  // ---------- states (เดิม) ----------
  const [stock, setStock] = useState(null);
  const [filter, setFilter] = useState("all");
  const [isFavorite, setIsFavorite] = useState(false);
  const headerRef = useRef(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [stockError, setStockError] = useState("");

  // ---------- states (ใหม่: Recommendation) ----------
  const [reco, setReco] = useState(null);
  const [recoLoading, setRecoLoading] = useState(false);
  const [recoError, setRecoError] = useState("");
  const [chartLoading, setChartLoading] = useState(true);
  const [chartError, setChartError] = useState("");
  const [showChart, setShowChart] = useState(false);

  // Utility mapping สีคำแนะนำ
  const recoColor = (r) => {
    const key = (r || "").toLowerCase();
    if (key.includes("strong buy")) return "#16a34a";
    if (key.includes("buy")) return "#22c55e";
    if (key.includes("hold")) return "#6b7280";
    if (key.includes("strong sell")) return "#b91c1c";
    if (key.includes("sell")) return "#ef4444";
    return "#6b7280";
  };

  useEffect(() => {
    setHeaderHeight(headerRef.current?.offsetHeight || 80);
  }, []);

  // ดึงข้อมูลหุ้น
  useEffect(() => {
    setStock(null);
    setStockError("");
    setChartLoading(true);
    setShowChart(false);
    setChartError("");

    const MIN_LOAD_TIME = 1200; // หน่วงให้ Animation เห็นแน่นอน
    const start = Date.now();

    fetch(`http://localhost:8000/stock/${symbol}`)
      .then((res) => {
        if (!res.ok) throw new Error("ไม่สามารถดึงข้อมูลหุ้นได้");
        return res.json();
      })
      .then((data) => {
        setStock(data);

        const elapsed = Date.now() - start;
        const wait = Math.max(0, MIN_LOAD_TIME - elapsed);

        // รอให้ครบเวลาขั้นต่ำ ค่อยแสดงกราฟ
        setTimeout(() => {
          setShowChart(true);
          setChartLoading(false);
        }, wait);
      })
      .catch((err) => {
        console.error(err);
        setStockError("เกิดข้อผิดพลาดในการดึงข้อมูลหุ้น หรือเชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
        setChartError("โหลดข้อมูลล้มเหลว กรุณาตรวจสอบการเชื่อมต่อ");
        setChartLoading(false);
      });

  }, [symbol]);
  
  // ดึงคำแนะนำลงทุน (Target Price + Recommendation)
  useEffect(() => {
    const run = async () => {
      setReco(null);
      setRecoError("");
      setRecoLoading(true);
      try {
        const res = await fetch(
          `http://localhost:8000/recommend?symbol=${encodeURIComponent(
            symbol
          )}&window_days=7`,
          { method: "POST" }
        );
        const json = await res.json();
        if (res.ok) {
          setReco(json);
        } else {
          setRecoError(json?.detail || "เกิดข้อผิดพลาดในการดึงคำแนะนำ");
        }
      } catch (e) {
        setRecoError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
      } finally {
        setRecoLoading(false);
      }
    };
    if (symbol) run();
  }, [symbol]);

  useEffect(() => {
    const favorites = JSON.parse(localStorage.getItem("favorites") || "[]");
    setIsFavorite(favorites.includes(symbol));
  }, [symbol]);

  if (!stock)
    return (
      <p className="text-center mt-10 text-gray-500">กำลังโหลดข้อมูล...</p>
    );

  const filteredNews =
    filter === "all"
      ? stock.news || []
      : (stock.news || []).filter((n) => {
          const sentiment = n.sentiment?.toLowerCase() || "neutral";
          return filter === "bullish"
            ? sentiment === "positive"
            : sentiment === "negative";
        });

  if (!stock?.news) {
    return <p className="text-center mt-10 text-gray-500">กำลังโหลดข่าว...</p>;
  }

  const chartData = {
    labels: stock.history?.map((d) => d.date) || [],
    datasets: [
      {
        label: `${symbol} Price`,
        data: stock.history?.map((d) => d.close) || [],
        borderColor: "#3b82f6",
        backgroundColor: "rgba(59, 130, 246, 0.1)",
        borderWidth: 2,
        pointRadius: 1.5,
        pointHoverRadius: 4,
        tension: 0, // เส้นตรง
        fill: true,
      },
    ],
  };

  const options = {
    responsive: true,
    scales: {
      x: {
        grid: { color: "rgba(200,200,200,0.1)" },
        ticks: { autoSkip: false, maxRotation: 45, minRotation: 30 },
      },
      y: {
        grid: { color: "rgba(200,200,200,0.2)" },
        ticks: { stepSize: 0.1, precision: 2 },
      },
    },
    elements: { line: { borderJoinStyle: "miter" } },
  };

  const handleBack = () => navigate("/search");

  const toggleFavorite = () => {
    const favorites = JSON.parse(localStorage.getItem("favorites") || "[]");
    let updated;
    if (favorites.includes(symbol)) {
      updated = favorites.filter((s) => s !== symbol);
      setIsFavorite(false);
    } else {
      updated = [...favorites, symbol];
      setIsFavorite(true);
    }
    localStorage.setItem("favorites", JSON.stringify(updated));
  };

  // คำนวณ %Upside/Downside จาก reco
  const pctText =
    reco && reco.current_price
      ? `${(((reco.target_price_mean - reco.current_price) / reco.current_price) * 100).toFixed(2)}%`
      : "-";

  return (
    <div className="w-full px-4 sm:px-6 md:px-8">
      <div className="back-button">
        <button onClick={handleBack} className="back-btn">
          Back
        </button>
      </div>

      {stock.name && (
        <div className="max-w-full flex flex-col items-start">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight">
            {stock.name} ({symbol})
          </h1>
          <p className="text-xl sm:text-2xl md:text-3xl text-green-500 font-semibold mt-1">
            ราคาล่าสุด: ${stock.price?.toLocaleString() ?? "-"}
          </p>
        </div>
      )}

      <button
        onClick={toggleFavorite}
        className={`favorite-star ${isFavorite ? "active" : ""}`}
      >
        ★
      </button>

      {/* กราฟหุ้น */}
      <div className="bg-white dark:bg-gray-700 p-4 rounded-xl shadow mb-6 min-h-[300px] flex items-center justify-center">
        {/* กำลังโหลด */}
        {chartLoading && !chartError && (
          <div className="flex flex-col items-center gap-3">
            <div className="skeleton-chart"></div>
            <p className="text-gray-500 dark:text-gray-300">กำลังโหลดกราฟ...</p>
          </div>
        )}

        {/* แจ้ง Error */}
        {!chartLoading && chartError && (
          <p className="text-red-400 text-center">{chartError}</p>
        )}

        {/* แสดงกราฟเมื่อโหลดสำเร็จ */}
        {!chartLoading && !chartError && showChart && stock?.history?.length > 0 && (
          <div className="chart-fade-in w-full">
            <Line data={chartData} options={options} />
          </div>
        )}
      </div>

      {/* 🔥 การ์ด Target Price + Recommendation */}
      <div className="ai-recommendation-card">
        <div className="ai-recommendation-header">
          <h3>Target Price & Recommendation (AI)</h3>
          {recoLoading && <span className="status loading">กำลังคำนวณคำแนะนำ…</span>}
          {recoError && <span className="status error">{recoError}</span>}
        </div>

        {reco && !recoError && (
          <div className="ai-recommendation-grid">
            <div className="info-card">
              <div className="label">คำแนะนำ</div>
              <div
                className="value reco-text"
                style={{ color: recoColor(reco.recommendation) }}
              >
                {reco.recommendation || "-"}
              </div>
              <div className="subtext">
                ความเชื่อมั่น: <b>{Math.round((reco.confidence || 0) * 100)}%</b>
              </div>
            </div>

            <div className="info-card">
              <div className="label">ราคาเป้าหมายเฉลี่ย</div>
              <div className="value">
                ${reco.target_price_mean?.toLocaleString() ?? "-"}
              </div>
              <div className="subtext">
                Upside/Downside: <b>{pctText}</b>
              </div>
            </div>

            <div className="info-card">
              <div className="label">สูงสุด / ต่ำสุด</div>
              <div className="value">
                ${reco.target_price_high?.toLocaleString() ?? "-"} / ${reco.target_price_low?.toLocaleString() ?? "-"}
              </div>
              <div className="subtext">
                ราคาปัจจุบัน: <b>${reco.current_price?.toLocaleString() ?? "-"}</b>
              </div>
            </div>

            <div className="info-card">
              <div className="label">ข่าวที่ใช้คำนวณ</div>
              <div className="value">{reco.news_count ?? 0} ชิ้น</div>
              <div className="subtext">
                ช่วงเวลา: {reco.window_days ?? 7} วัน
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ฟิลเตอร์ข่าว */}
      <div className="filter-buttons">
        {[
          { key: "all", label: "All" },
          { key: "bullish", label: "Bullish", icon: <GiBull /> },
          { key: "bearish", label: " Bearish", icon: <GiBearFace /> },
        ].map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`filter-btn ${filter === key ? "active" : ""}`}
          >
            {icon && <span className="icon">{icon}</span>}
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* แสดงข่าว */}
      <div className="news-grid ">
          {filteredNews?.length > 0 ? (
            filteredNews.map((n, i) => (
              <a
                key={i}
                href={n.link}
                target="_blank"
                rel="noopener noreferrer"
                className="news-card group"
                >
                  <div className="news-image-wrapper">
                    <img
                      src={n.image}
                      className="news-image"
                    />
                  </div>

              <div className="news-content">
                  <div>
                    <p className="news-title">{n.title}</p>
                    <p className="news-meta">{n.date} | {n.provider}</p>
                    <p
                      className={`news-sentiment ${
                      n.sentiment?.toLowerCase() === "positive"
                        ? "positive"
                        : n.sentiment?.toLowerCase() === "negative"
                        ? "negative"
                        : "neutral"
                      }`}
                    >
                        Sentiment: {n.sentiment}
                    </p>
                  </div>
              </div>
              </a>
            ))
          ) : (
            <p className="col-span-full text-center text-gray-500 mt-4">
              ไม่มีข่าวสารในหมวดหมู่นี้
            </p>
          )}
        </div>
    </div>
  );
}
