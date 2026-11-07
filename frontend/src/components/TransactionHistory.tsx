import { useState, useEffect } from "react";
import { api } from "../api/client";
import { formatEuro, todayIso } from "../lib/format";
import { useTerminals } from "../lib/useTerminals";
import RangeFields from "./RangeFields";

interface Transaction {
  orderId: string;
  terminalId: string;
  items: string;
  totalGross: number;
  status: "closed" | "cancelled";
  title?: string;
  cancelsOrderId?: string;
  closedAt: string;
}

const inputClass = "bg-gray-800 text-white rounded px-3 py-2 text-sm border border-gray-700";

function TransactionHistory() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [from, setFrom] = useState(todayIso);
  const [to, setTo] = useState(todayIso);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [terminal, setTerminal] = useState("");
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [error, setError] = useState("");
  const { terminals, nameOf } = useTerminals();

  const load = () => {
    const params = new URLSearchParams({ from, to });
    if (status !== "all") params.set("status", status);
    if (search) params.set("search", search);
    if (terminal) params.set("terminal", terminal);
    return api
      .get<Transaction[]>(`/reporting/transactions?${params}`)
      .then((rows) => {
        setError("");
        setTransactions(rows);
      })
      .catch((e: Error) => {
        setTransactions([]);
        setError(e.message);
      });
  };

  useEffect(() => { load(); }, [from, to, status, search, terminal]);

  const handleCancel = async (orderId: string) => {
    if (!window.confirm(`Buchung #${orderId.slice(0, 8)} wirklich stornieren?`)) return;
    setCancelling(orderId);
    try {
      await api.post(`/orders/${orderId}/cancel`, { reason: "Storniert im Admin-Bereich" });
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCancelling(null);
    }
  };

  const statusBadge = (s: string) => {
    const base = "px-2 py-0.5 rounded text-xs font-semibold";
    return s === "cancelled" ? `${base} bg-red-600 text-white` : `${base} bg-green-600 text-white`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white text-xl font-bold">Buchungen</h2>
        <RangeFields from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
      </div>

      <div className="flex gap-2 mb-4">
        <input
          className={`flex-1 ${inputClass}`}
          placeholder="Suche nach Buchung oder Artikel..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Status"
          className={inputClass}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">Alle Status</option>
          <option value="closed">Abgeschlossen</option>
          <option value="cancelled">Storniert</option>
        </select>
        <select
          aria-label="Terminal"
          className={inputClass}
          value={terminal}
          onChange={(e) => setTerminal(e.target.value)}
        >
          <option value="">Alle Terminals</option>
          {terminals.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 mb-4 text-red-300 text-sm">
          {error}
        </div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-400 border-b border-gray-700">
            <th className="text-left py-2">Buchung</th>
            <th className="text-left py-2">Terminal</th>
            <th className="text-left py-2">Artikel</th>
            <th className="text-right py-2">Summe</th>
            <th className="text-left py-2">Status</th>
            <th className="text-left py-2">Titel</th>
            <th className="text-left py-2">Zeitpunkt</th>
            <th className="text-left py-2"></th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr
              key={t.orderId}
              className={`border-b border-gray-800 ${
                t.status === "cancelled" ? "line-through text-red-400" : "text-white"
              }`}
            >
              <td className="py-2">{t.orderId.slice(0, 8)}</td>
              <td className="py-2 text-gray-400">{nameOf(t.terminalId)}</td>
              <td className="py-2">{t.items}</td>
              <td className="py-2 text-right">{formatEuro(t.totalGross)}</td>
              <td className="py-2">
                <span className={statusBadge(t.status)}>
                  {t.status === "cancelled" ? "Storniert" : "Abgeschlossen"}
                </span>
              </td>
              <td className="py-2 text-gray-500 text-xs">
                {t.title || (t.cancelsOrderId ? `Storno zu #${t.cancelsOrderId.slice(0, 8)}` : "")}
              </td>
              <td className="py-2 text-gray-500 text-xs">
                {t.closedAt ? new Date(t.closedAt).toLocaleString("de-DE") : ""}
              </td>
              <td className="py-2">
                {t.status === "closed" && !t.cancelsOrderId && (
                  <button
                    onClick={() => handleCancel(t.orderId)}
                    disabled={cancelling === t.orderId}
                    className="bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-xs px-2 py-1 rounded"
                  >
                    {cancelling === t.orderId ? "..." : "Stornieren"}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {transactions.length === 0 && !error && (
        <div className="text-gray-500 text-center py-8">Keine Buchungen gefunden</div>
      )}
    </div>
  );
}

export default TransactionHistory;
