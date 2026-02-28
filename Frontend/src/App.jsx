import React, { useState } from "react";
import "./App.css";
import { Routes, Route, Navigate } from "react-router-dom";
import { LanguageProvider } from "./Components/LanguageContext";
import { AuthProvider } from "./Components/AuthContext";
import PrivateLayout from "./Components/PrivateLayout";
import LoginPage from "./LoginPage";
import RegisterPage from "./Pages/RegisterPage";
import ForgotPassword from "./Pages/ForgotPassword";
import ResetPassword from "./Pages/ResetPassword";
import RiskPage from "./Pages/RiskPage";
import FavoritePage from "./Pages/FavoritePage";
import SearchPage from "./Pages/SearchPage";
import Stockdetail from "./Components/Stockdetail";
import RecommendationPage from "./Pages/RecommendationPage";

export default function App() {
  console.log("Current path in App:", window.location.pathname);
  return (
    <AuthProvider>
      <LanguageProvider>
        <Routes>
          {/* public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* private */}
          <Route element={<PrivateLayout />}>
            <Route path="/search" element={<SearchPage />} />
            <Route path="/stock/:symbol" element={<Stockdetail />} />
            <Route path="/risk" element={<RiskPage />} />
            <Route path="/favorite" element={<FavoritePage />} />
            <Route path="/recommendation" element={<RecommendationPage />} />
          </Route>

          <Route path="/" element={<Navigate to="/login" />} />
        </Routes>
      </LanguageProvider>
    </AuthProvider>
  );
}
