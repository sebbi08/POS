import { useState, useEffect } from "react";
import { api } from "../api/client";

interface Transaction {
  orderId: string;
  terminalId: string;
  items: string;
  totalGross: number;
  status: string;
  title?: string;
  cancelsOrderId?: string;
  closedAt: string;
}

function TransactionHistory() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [terminal, setTerminal] = useState("");

  const load = () => {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (search) params.set("search", search);
    if (terminal) params.set("terminal", terminal);
    api.get<Transaction[]>(`/reporting/transactions?${params}`).then(setTransactions);
  };

  useEffect(() => { load(); }, [status, search, terminal]);

  return (
    <div>
      <h2 className="text-white text-xl font-bold mb-4">Transactions</h2>

      <div className="flex gap-2 mb-4">
        <input
          className="flex-1 bg-gray-800 text-white rounded px-3 py-2 text-sm border border-gray-700"
          placeholder="Search by order ID or item..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="bg-gray-800 text-white rounded px-3 py-2 text-sm border border-gray-700"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All Status</option>
          <option value="closed">Closed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <input
          className="bg-gray-800 text-white rounded px-3 py-2 text-sm border border-gray-700 w-32"
          placeholder="Terminal"
          value={terminal}
          onChange={(e) => setTerminal(e.target.value)}
        />
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-gray-400 border-b border-gray-700">
            <th className="text-left py-2">Order #</th>
            <th className="text-left py-2">Terminal</th>
            <th className="text-left py-2">Items</th>
            <th className="text-right py-2">Total</th>
            <th className="text-left py-2">Status</th>
            <th className="text-left py-2">Title</th>
            <th className="text-left py-2">Closed</th>
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
              <td className="py-2 text-gray-400">{t.terminalId}</td>
              <td className="py-2">{t.items}</td>
              <td className="py-2 text-right">{t.totalGross.toFixed(2)}€</td>
              <td className="py-2">
                <span
                  className={`px-2 py-0.5 rounded text-xs font-semibold ${
                    t.status === "cancelled"
                      ? "bg-red-600 text-white"
                      : "bg-green-600 text-white"
                  }`}
                >
                  {t.status}
                </span>
              </td>
              <td className="py-2 text-gray-500 text-xs">
                {t.title || (t.cancelsOrderId ? `Cancels #${t.cancelsOrderId.slice(0, 8)}` : "")}
              </td>
              <td className="py-2 text-gray-500 text-xs">
                {t.closedAt ? new Date(t.closedAt).toLocaleTimeString("de-DE") : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {transactions.length === 0 && (
        <div className="text-gray-500 text-center py-8">No transactions found</div>
      )}
    </div>
  );
}

export default TransactionHistory;
