import { useState } from "react";
import { api } from "../api/client";
import type { UserSession } from "../App";

interface Props {
  onLogin: (session: UserSession) => void;
}

function Login({ onLogin }: Props) {
  const [pin, setPin] = useState("");
  const [terminal, setTerminal] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleDigit = (d: string) => {
    if (pin.length < 6) {
      setPin(pin + d);
      setError("");
    }
  };

  const handleClear = () => setPin("");
  const handleBackspace = () => setPin(pin.slice(0, -1));

  const handleLogin = async () => {
    if (pin.length < 4) return;
    setLoading(true);
    setError("");
    try {
      const data = await api.post<UserSession>("/auth/login", {
        pin,
        terminalId: terminal || undefined,
      });
      onLogin(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Login failed");
      setPin("");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-gray-800 rounded-2xl p-8 w-96 shadow-2xl">
        <h1 className="text-white text-2xl font-bold text-center mb-6">
          POS Login
        </h1>

        {error && (
          <div className="bg-red-500/20 text-red-300 rounded-lg p-3 mb-4 text-center text-sm">
            {error}
          </div>
        )}

        <div className="mb-4">
          <input
            type="text"
            className="w-full bg-gray-700 text-white text-sm rounded-lg px-3 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
            placeholder="Terminal name (optional)"
            value={terminal}
            onChange={(e) => setTerminal(e.target.value)}
          />
        </div>

        <div className="bg-gray-700 rounded-lg p-4 mb-4 text-center">
          <div className="text-gray-400 text-xs mb-1">Enter PIN</div>
          <div className="flex justify-center gap-2 mb-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-full ${
                  i < pin.length ? "bg-blue-400" : "bg-gray-600"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", ""].map((d, i) =>
            d ? (
              <button
                key={i}
                onClick={() => handleDigit(d)}
                className="bg-gray-700 hover:bg-gray-600 text-white text-xl font-bold rounded-lg py-3 transition-colors"
              >
                {d}
              </button>
            ) : (
              <div key={i} />
            )
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleClear}
            className="bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg py-3 text-sm font-semibold"
          >
            Clear
          </button>
          <button
            onClick={handleLogin}
            disabled={pin.length < 4 || loading}
            className="bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white rounded-lg py-3 text-sm font-semibold disabled:cursor-not-allowed"
          >
            {loading ? "..." : "Login"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Login;
