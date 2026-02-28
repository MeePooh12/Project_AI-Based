import React, { useState, useRef, useEffect, useContext, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { CiSquarePlus } from "react-icons/ci";
import { LanguageContext } from "../Components/LanguageContext";
import "./SearchPage.css";

const stocks = [
  { name: "NIVDIA Corporation", symbol: "NVDA", sector: "Technology"},
  { name: "Microsoft Corporation", symbol: "MSFT", sector: "Technology"},
  { name: "UnitedHealth Group Incorporated",  symbol: "UNH",  sector: "Healthcare"},
  { name: "Amazon.com, Inc.", symbol: "AMZN", sector: "Consumer Discretionary"},
  { name: "Advanced Micro Devices, Inc.", symbol: "AMD", sector: "Technology"},
  { name: "Alphabet Inc.", symbol: "GOOGL", sector: "Technology"},
  { name: "Micron Technology, Inc.", symbol: "MU", sector: "Technology"},
  { name: "Taiwan Semiconductor Manufacturing Company Limited", symbol: "TSM", sector: "Technology"},
  { name: "Novo Nordisk A/S", symbol: "NVO", sector: "Healthcare"},
  { name: "Meta Platforms, Inc.", symbol: "META", sector: "Technology"},
  { name: "Berkshire Hathaway Inc.", symbol: "BRK-A", sector: "Financials"}
];

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [hideModalStocks, setHideModalStocks] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [selectedStockData, setSelectedStockData] = useState(null);
  const [dailyNews, setDailyNews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [favorites, setFavorites] = useState([]);
  const navigate = useNavigate();
  const { language } = useContext(LanguageContext);
  const modalRef = useRef(null);
  const addButtonRef = useRef(null);

  const t = {
    en: { 
      title: "Stock Search", News: "News Daily", category: "There is no news in this category", 
      loading: "Loading Data...", searchstock:"Search for stock names such as NVDA", 
      favorites: "Your Favorites"  },
    th: { 
      title: "ค้นหาหุ้นที่คุณสนใจ", News: "ข่าววันนี้", category: "ไม่มีข่าวสารในหมวดหมู่นี้", 
      loading: "กำลังโหลดข้อมูล...", searchstock:"ค้นหาชื่อหุ้น เช่น NVDA", 
      favorites: "หุ้นที่คุณติดตาม" },
  };

  const filteredStocks = useMemo(() => {
    if (!debouncedQuery) return [];
      const q = debouncedQuery.toLowerCase();

      return stocks
        .filter(
          (stock) =>
            stock.symbol.toLowerCase().includes(q)||
            stock.name.toLowerCase().includes(q) 
        )
        .sort((a, b) => a.symbol.localeCompare(b.symbol)); // ✅ เรียงตามชื่อหุ้น A-Z
  }, [debouncedQuery]);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(handler);
  }, [query]);
  
  useEffect(() => {
    const favs = JSON.parse(localStorage.getItem("favorites")) || [];
    setFavorites(favs);
  }, []);

  // ดึงข่าวรายวันจากหุ้นทั้งหมด
  useEffect(() => {
    const fetchNews = async () => {
      try {
        const stockSlice = stocks.slice(0, 4);
        const responses = await Promise.all(
          stockSlice.map((s) => fetch(`/stock/${s.symbol}`))  // ← เปลี่ยนเป็น relative path
        );
        const results = await Promise.all(responses.map((r) => r.json()));

        let news = [];

      for (let res of results) {
        const stockSymbol = res.symbol || "";
          const stockName = res.name || "";

          // 1️⃣ ข่าวจาก backend
          const apiNews = (res?.news && Array.isArray(res.news) ? res.news.slice(0, 2) : []).map((n) => ({
            ...n,
            symbol: stockSymbol,
            name: stockName,
          }));

          news = news.concat(apiNews);

          // 2️⃣ ข่าว RSS fallback (Yahoo Finance)
          try {
            const rssRes = await fetch(`/rss/${stockSymbol}`);
            const rssData = await rssRes.json();
            const rssNews = (rssData?.news || []).slice(0, 2).map((n) => ({
              ...n,
              symbol: stockSymbol,
              name: stockName,
            }));
            news = news.concat(rssNews);
          } catch (rssErr) {
            console.warn(`Failed to fetch RSS news for ${stockSymbol}:`, rssErr);
            setNewsList([]);
          }
        }

        // ลบข่าวซ้ำ (ตามลิงก์)
        const uniqueNews = [...new Map(news.map(item => [item.link, item])).values()];

        setDailyNews(uniqueNews);
      } catch (err) {
        console.error("Error fetching daily news:", err);
        setDailyNews([]);
      }
    };

    fetchNews();
  }, []);

  //เลือกหุ้น
  const handleSelect =  useCallback (async (stock) => {
    setShowDropdown(false);
    setLoading(true);

    try {
      const res = await fetch(`/stock/${stock.symbol}`);
      const data = await res.json();
      setSelectedStockData(data);

      setTimeout(() => {
        navigate(`/stock/${stock.symbol}`);
        setLoading(false);
      }, 1000);
      console.log("ข้อมูลจาก backend:", data);

    } catch (err) {
      console.error("Fetch backend failed:", err);
      setLoading(false);
    }
  },[navigate]);

  const handleKeyDown = (e) => {
    if (!showDropdown || filteredStocks.length === 0) return;

    if (e.key === "ArrowDown") {
      setHighlightedIndex((prev) =>
        prev < filteredStocks.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : filteredStocks.length - 1
      );
    } else if (e.key === "Enter") {
      handleSelect(filteredStocks[highlightedIndex]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  };

  const toggleFavorite = (symbol) => {
    setFavorites(prev => {
      let updated;

      if (prev.includes(symbol)) {
        updated = prev.filter((s) => s !== symbol);
      } else {
        updated = [...prev, symbol];
      }

      localStorage.setItem("favorites", JSON.stringify(updated));
      return updated;
    });
  };

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        modalRef.current && 
        !modalRef.current.contains(event.target) &&
        addButtonRef.current &&
        !addButtonRef.current.contains(event.target)
      ) {
        setHideModalStocks(true); // ซ่อนหุ้น
      }
    };

    if (showAddModal && !hideModalStocks) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showAddModal, hideModalStocks]);

  return (
    <div className="search-page">  
        <h2 className="text-lg font-semibold mb-2">ค้นหาชื่อหุ้น</h2>
          <div className="container">
            <form className="Search-form mb-4">
              <Search
                className="absolute left-3 top-3 text-gray-400"
                size={20}
              />{" "}
              <input
                type="text"
                placeholder= "ค้นหาชื่อหุ้น เช่น NVDA, MSFT"
                className="input-option w-full pl-10 border-2 border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 rounded-lg transition"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                onKeyDown={handleKeyDown}
                />
              </form>
          </div>
          
          {showDropdown && query && filteredStocks.length > 0 && (
            <div className="dropdown-absolute">
              {filteredStocks.map((stock, index) => (
                <div
                  key={stock.symbol}
                  className="stock-row"
                  onClick={() => handleSelect(stock)}
                >
                  <div className="stock-left">
                    <img 
                      src={`https://financialmodelingprep.com/image-stock/${stock.symbol}.png`}
                      alt={stock.symbol}
                      className="stock-logo w-16 h-16 rounded-full object-contain bg-white p-1 border"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = `https://via.placeholder.com/64/cccccc/ffffff?text=${stock.symbol}`;
                      }}
                    />
                    <div>
                      <div className="stock-symbol">{stock.symbol}</div>
                      <div className="stock-name">{stock.name}</div>
                      <div className="stock-sector">{stock.sector}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

          )}{favorites.length > 0 && (
            <div className="favorites-bar flex flex-wrap gap-4 mb-6">
              {favorites.map((symbol) => {
                const stock = stocks.find((s) => s.symbol === symbol);
                if (!stock) return null;
                return (
                  <div
                    key={stock.symbol}
                    className="favorite-item"
                    onClick={() => handleSelect(stock)}
                  >
                    <img 
                      src={`https://financialmodelingprep.com/image-stock/${stock.symbol}.png`}
                      alt={stock.symbol}
                      className="stock-logo w-16 h-16 rounded-full object-contain bg-white p-1 border"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = `https://via.placeholder.com/64/cccccc/ffffff?text=${stock.symbol}`;
                      }}
                    />
                    <span className="favorite-name">{stock.symbol}</span>
                  </div>
                );
              })}
              <div
                ref={addButtonRef}
                className="favorite-add-button flex flex-col items-center justify-center cursor-pointer"
                onClick={() => {
                  setShowAddModal(true);
                  setHideModalStocks(prev => !prev);
                }}
              >
                <CiSquarePlus className="favorite-icon" size={50}/>
              </div>         
            </div>
          )}

          {showAddModal && !hideModalStocks && (
            <div className="modal-stock-row" ref={modalRef}>
              {stocks
                .filter(stock => !favorites.includes(stock.symbol))
                .map(stock => (
                  <div
                    key={stock.symbol}
                    className="modal-stock-item"
                    onClick={() => {
                      toggleFavorite(stock.symbol);     // เพิ่มหุ้นเข้า favorites
                      setHideModalStocks(true);         // ซ่อนหุ้นทั้งหมดหลังเพิ่ม
                    }}
                    title={stock.symbol}
                  >
                    <img 
                      src={`https://financialmodelingprep.com/image-stock/${stock.symbol}.png`}
                      alt={stock.symbol}
                      className="stock-logo w-16 h-16 rounded-full object-contain bg-white p-1 border"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = `https://via.placeholder.com/64/cccccc/ffffff?text=${stock.symbol}`;
                      }}
                    />
                  </div>
                ))}
            </div>
          )}

          {/* 2️⃣ หุ้นที่เลือก */}
          {selectedStockData && (
            <div className="selected-stock max-w-md mx-auto p-4 border rounded-xl bg-white shadow-lg">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-2xl font-bold text-blue-600">{selectedStockData.ticker}</h3>
                <span className="text-gray-500 text-sm">{selectedStockData.sector || "Unknown Sector"}</span>
              </div>

              {loading && (
                <div className="loading-overlay">
                  <div className="spinner"></div>
                  <p>{t[language].loading}</p>
                </div>
              )}
              
              {selectedStockData.sentiment && (
                <p className="mb-2">
                  Sentiment:{" "}
                  <span className={`font-medium ${
                    selectedStockData.sentiment === "Positive" ? "text-green-500" :
                    selectedStockData.sentiment === "Negative" ? "text-red-500" : "text-gray-500"
                  }`}>
                    {selectedStockData.sentiment}
                  </span>
                </p>
              )}
            </div>
          )}

        {/* 🔹 ข่าวรายวัน */}
        <h2 className="section-title">ข่าวรายวัน</h2>
        <div className="daily-news-section mt-8">
          {dailyNews.filter(news => news.image).length > 0 ? (
            [...new Map(dailyNews.filter(news => news.image).map(item => [item.link, item])).values()].map((news, i) => (
              <a
                key={i}
                href={news.link}
                target="_blank"
                rel="noopener noreferrer"
                className="news-card flex bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-xl shadow-md overflow-hidden transition p-2"
              >
                <div className="w-28 h-24 flex-shrink-0 overflow-hidden relative rounded-md">
                  <img
                    src={news.image}
                    className="w-full h-full object-cover"
                  />
                <div className="news-content flex-1 pl-3">
                  <p className="font-medium text-sm dark:text-gray-100 text-gray-800 line-clamp-2 leading-snug">
                    {news.title}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {news.date} | {news.provider}
                  </p>
                </div>
                </div>
              </a>
            ))
          ) : (
            <p className="text-gray-500">ไม่มีข่าวสารในหมวดหมู่นี้</p>
          )}
        </div>
    </div>
  );
}
