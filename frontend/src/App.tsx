import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./views/Login";
import AdminLayout from "./views/AdminLayout";
import { useTheme, useThemePreference } from "./lib/theme";

function App() {
  const [theme] = useThemePreference();
  useTheme(theme);

  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/admin" element={<AdminLayout />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
