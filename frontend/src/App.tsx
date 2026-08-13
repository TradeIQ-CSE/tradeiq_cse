import { Routes, Route } from "react-router-dom";
import { MarketsPage } from "./features/markets/MarketsPage";
import { LandingPage } from "./features/landing/LandingPage";
import { AdminHome } from "./routes";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/markets" element={<MarketsPage />} />
      <Route path="/admin" element={<AdminHome />} />
    </Routes>
  );
}
