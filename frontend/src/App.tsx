import { Routes, Route } from "react-router-dom";
import { InvestorHome, AdminHome } from "./routes";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<InvestorHome />} />
      <Route path="/admin" element={<AdminHome />} />
    </Routes>
  );
}
