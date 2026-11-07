import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

function Login() {
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleDigit = (d: string) => {
    if (pin.length < 6) { setPin(pin + d); setError(""); }
  };

  const handleAdminLogin = async () => {
    if (pin.length < 4) return;
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/login", { pin });
      api.setAdminPin(pin);
      navigate("/admin");
    } catch {
      setError("Invalid PIN");
      setPin("");
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white text-lg">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-gray-800 rounded-2xl p-8 w-96 shadow-2xl">
        <h1 className="text-white text-2xl font-bold text-center mb-2">Admin Login</h1>
        <p className="text-gray-400 text-xs text-center mb-4">Enter admin PIN</p>

        {error && (
          <div className="bg-red-500/20 text-red-300 rounded-lg p-3 mb-4 text-center text-sm">
            {error}
          </div>
        )}

        <div className="bg-gray-700 rounded-lg p-4 mb-4 text-center">
          <div className="flex justify-center gap-2 mb-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className={`w-3 h-3 rounded-full ${i < pin.length ? "bg-blue-400" : "bg-gray-600"}`} />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-2">
          {["1","2","3","4","5","6","7","8","9","","0",""].map((d, i) =>
            d ? (
              <button key={i} onClick={() => handleDigit(d)}
                className="bg-gray-700 hover:bg-gray-600 text-white text-xl font-bold rounded-lg py-3 transition-colors">
                {d}
              </button>
            ) : <div key={i} />
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => { setPin(""); setError(""); }}
            className="bg-gray-600 hover:bg-gray-500 text-white rounded-lg py-3 text-sm">
            Clear
          </button>
          <button onClick={handleAdminLogin} disabled={pin.length < 4 || loading}
            className="bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white rounded-lg py-3 text-sm font-semibold disabled:cursor-not-allowed">
            {loading ? "..." : "Login"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Login;
