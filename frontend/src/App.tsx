import { Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
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

  useEffect(() => {
    if (session) {
      localStorage.setItem("pos-session", JSON.stringify(session));
    } else {
      localStorage.removeItem("pos-session");
    }
  }, [session]);

  const handleEnterPOS = (terminalId: string, terminalName: string) => {
    setSession({ type: "pos", terminalId, terminalName });
  };

  const handleEnterAdmin = () => {
    setSession({ type: "admin" });
  };

  const handleLogout = () => {
    api.clearAdminPin();
    setSession(null);
  };

  if (!session) {
    return <Login onEnterPOS={handleEnterPOS} onEnterAdmin={handleEnterAdmin} />;
  }

  return (
    <Routes>
      <Route
        path="/pos"
        element={
          session.type === "pos" ? (
            <POSLayout session={session} onLogout={handleLogout} />
          ) : (
            <Navigate to="/admin" replace />
          )
        }
      />
      <Route path="/admin" element={<AdminLayout onLogout={handleLogout} />} />
      <Route path="*" element={<Navigate to={session.type === "admin" ? "/admin" : "/pos"} replace />} />
    </Routes>
  );
}

export default App;
