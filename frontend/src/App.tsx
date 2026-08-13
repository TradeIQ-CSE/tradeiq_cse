import { Routes, Route } from "react-router-dom";
import { MarketsPage } from "./features/markets/MarketsPage";
import { AdminHome } from "./routes";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<MarketsPage />} />
      <Route path="/admin" element={<AdminHome />} />
    </Routes>
  );
}
