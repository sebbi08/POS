import { Routes, Route, Navigate } from "react-router-dom";
import { useState } from "react";
import { api } from "./api/client";
import Login from "./views/Login";
import POSLayout from "./views/POSLayout";
import AdminLayout from "./views/AdminLayout";

export type Session =
  | { type: "pos"; terminalId: string; terminalName: string }
  | { type: "admin" }
  | null;

function App() {
  const [session, setSession] = useState<Session>(() => {
    const stored = localStorage.getItem("pos-session");
    if (stored) return JSON.parse(stored);
    return null;
  });

  const handleEnterPOS = (terminalId: string, terminalName: string) => {
    const s: Session = { type: "pos", terminalId, terminalName };
    localStorage.setItem("pos-session", JSON.stringify(s));
    setSession(s);
  };

  const handleEnterAdmin = () => {
    const s: Session = { type: "admin" };
    localStorage.setItem("pos-session", JSON.stringify(s));
    setSession(s);
  };

  const handleLogout = () => {
    localStorage.removeItem("pos-session");
    api.clearAdminPin();
    setSession(null);
  };

  if (!session) {
    return <Login onEnterPOS={handleEnterPOS} onEnterAdmin={handleEnterAdmin} />;
  }

  return (
    <Routes>
      <Route
        path="/pos/*"
        element={
          session.type === "pos" ? (
            <POSLayout session={session} onLogout={handleLogout} />
          ) : (
            <Navigate to="/admin" />
          )
        }
      />
      <Route
        path="/admin/*"
        element={
          session.type === "admin" ? (
            <AdminLayout onLogout={handleLogout} />
          ) : (
            <Navigate to="/pos" />
          )
        }
      />
      <Route
        path="*"
        element={<Navigate to={session.type === "admin" ? "/admin" : "/pos"} />}
      />
    </Routes>
  );
}

export default App;
