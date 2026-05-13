import { Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import Login from "./views/Login";
import POSLayout from "./views/POSLayout";
import AdminLayout from "./views/AdminLayout";

export interface UserSession {
  sessionId: string;
  user: { id: string; name: string; role: "admin" | "terminal" };
}

function App() {
  const [session, setSession] = useState<UserSession | null>(() => {
    const stored = localStorage.getItem("pos-session");
    return stored ? JSON.parse(stored) : null;
  });

  useEffect(() => {
    if (session) {
      localStorage.setItem("pos-session", JSON.stringify(session));
    } else {
      localStorage.removeItem("pos-session");
    }
  }, [session]);

  const handleLogin = (s: UserSession) => setSession(s);
  const handleLogout = () => setSession(null);

  if (!session) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <Routes>
      <Route
        path="/pos/*"
        element={<POSLayout session={session} onLogout={handleLogout} />}
      />
      <Route
        path="/admin/*"
        element={
          session.user.role === "admin" ? (
            <AdminLayout session={session} onLogout={handleLogout} />
          ) : (
            <Navigate to="/pos" />
          )
        }
      />
      <Route
        path="*"
        element={
          <Navigate
            to={session.user.role === "admin" ? "/admin" : "/pos"}
          />
        }
      />
    </Routes>
  );
}

export default App;
