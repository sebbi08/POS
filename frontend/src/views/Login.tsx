import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
      setError("Ungültige PIN");
      setPin("");
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-foreground text-lg">
        Lädt...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Card className="w-96 p-8 shadow-2xl">
        <h1 className="text-foreground text-2xl font-bold text-center">Administrator-Anmeldung</h1>
        <p className="text-muted-foreground text-xs text-center">Administrator-PIN eingeben</p>

        {error && (
          <Alert variant="destructive">
            <AlertDescription className="text-center">{error}</AlertDescription>
          </Alert>
        )}

        <div className="bg-muted rounded-lg p-4 flex justify-center gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={`w-3 h-3 rounded-full ${i < pin.length ? "bg-blue-400" : "bg-border"}`} />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {["1","2","3","4","5","6","7","8","9","","0",""].map((d, i) =>
            d ? (
              <Button key={i} variant="secondary" size="lg" className="min-h-12 min-w-12 text-xl font-bold"
                onClick={() => handleDigit(d)}>
                {d}
              </Button>
            ) : <div key={i} />
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="lg" className="min-h-12" onClick={() => { setPin(""); setError(""); }}>
            Löschen
          </Button>
          <Button size="lg" className="min-h-12 font-semibold" onClick={handleAdminLogin} disabled={pin.length < 4 || loading}>
            {loading ? "..." : "Anmelden"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default Login;
