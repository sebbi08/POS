import { useState, useEffect, useCallback } from "react";
import { api } from "../api/client";
import type { UserSession } from "../App";
import ItemGrid from "../components/ItemGrid";
import OrderPanel from "../components/OrderPanel";

interface TerminalItem {
  id: string;
  name: string;
  price: number;
}

interface OrderItem {
  itemId: string;
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
}

interface Order {
  id: string;
  status: string;
  items: OrderItem[];
}

interface Props {
  session: UserSession;
  onLogout: () => void;
}

function POSLayout({ session, onLogout }: Props) {
  const [terminalId, setTerminalId] = useState<string>("");
  const [terminals, setTerminals] = useState<{ id: string; name: string }[]>([]);
  const [items, setItems] = useState<TerminalItem[]>([]);
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ id: string; name: string }[]>("/terminals").then((data) => {
      setTerminals(data);
      if (data.length > 0) {
        const saved = localStorage.getItem("pos-terminal");
        const tid = saved && data.find((t) => t.id === saved) ? saved : data[0].id;
        setTerminalId(tid);
      }
      setLoading(false);
    });
  }, []);

  const loadItems = useCallback((tid: string) => {
    localStorage.setItem("pos-terminal", tid);
    api.get<TerminalItem[]>(`/terminals/${tid}/items`).then(setItems);
  }, []);

  useEffect(() => {
    if (terminalId) loadItems(terminalId);
  }, [terminalId, loadItems]);

  const handleNewOrder = async () => {
    const data = await api.post<{ id: string }>("/orders/open", { terminalId });
    setCurrentOrder({ id: data.id, status: "open", items: [] });
  };

  const handleAddItem = async (itemId: string) => {
    if (!currentOrder) return;
    await api.post(`/orders/${currentOrder.id}/items`, { itemId, qty: 1 });
    const orders = await api.get<Order[]>(`/orders?terminalId=${terminalId}`);
    const updated = orders.find((o) => o.id === currentOrder.id);
    if (updated) setCurrentOrder(updated);
  };

  const handlePrintPickup = async (itemId: string) => {
    if (!currentOrder) return;
    await api.post(`/orders/${currentOrder.id}/print-pickup`, { itemId });
  };

  const handlePrintFinal = async () => {
    if (!currentOrder) return;
    await api.post(`/orders/${currentOrder.id}/print-final`);
  };

  const handlePayAndClose = async () => {
    if (!currentOrder) return;
    await api.post(`/orders/${currentOrder.id}/pay`);
    await api.post(`/orders/${currentOrder.id}/close`);
    setCurrentOrder(null);
  };

  const handleCancel = async () => {
    if (!currentOrder) return;
    await api.post(`/orders/${currentOrder.id}/cancel`, {
      reason: "Cancelled from terminal",
    });
    setCurrentOrder(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-gray-800 px-4 py-2 flex items-center justify-between border-b border-gray-700">
        <div className="flex items-center gap-4">
          <h1 className="text-white font-bold text-lg">POS Terminal</h1>
          {terminals.length > 1 && (
            <select
              value={terminalId}
              onChange={(e) => setTerminalId(e.target.value)}
              className="bg-gray-700 text-white text-sm rounded px-2 py-1 border border-gray-600"
            >
              {terminals.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-gray-400 text-sm">{session.user.name}</span>
          <button
            onClick={onLogout}
            className="bg-red-600 hover:bg-red-500 text-white text-sm px-3 py-1 rounded"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="flex-1 flex gap-4 p-4 overflow-hidden">
        <div className="flex-[3]">
          <ItemGrid
            items={items}
            onAddItem={handleAddItem}
            onNewOrder={handleNewOrder}
            hasOrder={!!currentOrder}
          />
        </div>
        <div className="flex-[2]">
          <OrderPanel
            order={currentOrder}
            onPrintPickup={handlePrintPickup}
            onPrintFinal={handlePrintFinal}
            onPayAndClose={handlePayAndClose}
            onCancel={handleCancel}
          />
        </div>
      </main>
    </div>
  );
}

export default POSLayout;
