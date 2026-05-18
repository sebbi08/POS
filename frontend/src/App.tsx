import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./views/Login";
import POSLayout from "./views/POSLayout";
import AdminLayout from "./views/AdminLayout";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/pos/:terminalId" element={<POSLayout />} />
      <Route path="/admin" element={<AdminLayout />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
