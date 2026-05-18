import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import ItemGrid from "../components/ItemGrid";
import OrderPanel from "../components/OrderPanel";
import PrinterSettings from "../components/PrinterSettings";

interface TerminalItem {
  id: string;
  name: string;
  price: number;
}

interface TerminalInfo {
  id: string;
  name: string;
}

interface Order {
  id: string;
  status: string;
  items: { itemId: string; name: string; qty: number; unitPrice: number; total: number }[];
}

function POSLayout() {
  const { terminalId } = useParams<{ terminalId: string }>();
  const navigate = useNavigate();
  const [terminalName, setTerminalName] = useState("");
  const [items, setItems] = useState<TerminalItem[]>([]);
  const [currentOrder, setCurrentOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!terminalId) return;

    const terminals = await api.get<TerminalInfo[]>("/terminals");
    const terminal = terminals.find((t) => t.id === terminalId);
    if (terminal) setTerminalName(terminal.name);

    const items = await api.get<TerminalItem[]>(`/terminals/${terminalId}/items`);
    setItems(items);

    const orders = await api.get<Order[]>(`/orders?terminalId=${terminalId}`);
    const open = orders.find((o) => o.status === "open");
    if (open) setCurrentOrder(open);

    setLoading(false);
  }, [terminalId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAddItem = async (itemId: string) => {
    if (!terminalId) return;
    let order = currentOrder;
    if (!order) {
      try {
        const data = await api.post<{ id: string }>("/orders/open", { terminalId });
        order = { id: data.id, status: "open", items: [] };
        setCurrentOrder(order);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("409")) {
          const orders = await api.get<Order[]>(`/orders?terminalId=${terminalId}`);
          const existing = orders.find((o) => o.status === "open");
          if (existing) {
            order = existing;
            setCurrentOrder(order);
          } else {
            return;
          }
        } else {
          return;
        }
      }
    }
    await api.post(`/orders/${order.id}/items`, { itemId, qty: 1 });
    const orders = await api.get<Order[]>(`/orders?terminalId=${terminalId}`);
    const updated = orders.find((o) => o.id === order!.id);
    if (updated) setCurrentOrder(updated);
  };

  const handleIncreaseQty = async (itemId: string) => {
    if (!currentOrder || !terminalId) return;
    await api.post(`/orders/${currentOrder.id}/items`, { itemId, qty: 1 });
    const orders = await api.get<Order[]>(`/orders?terminalId=${terminalId}`);
    const updated = orders.find((o) => o.id === currentOrder.id);
    if (updated) setCurrentOrder(updated);
  };

  const handleDecreaseQty = async (itemId: string) => {
    if (!currentOrder || !terminalId) return;
    await api.post(`/orders/${currentOrder.id}/items`, { itemId, qty: -1 });
    const orders = await api.get<Order[]>(`/orders?terminalId=${terminalId}`);
    const updated = orders.find((o) => o.id === currentOrder.id);
    if (updated) setCurrentOrder(updated);
  };

  const handleRemoveItem = async (itemId: string) => {
    if (!currentOrder || !terminalId) return;
    await api.delete(`/orders/${currentOrder.id}/items/${itemId}`);
    const orders = await api.get<Order[]>(`/orders?terminalId=${terminalId}`);
    const updated = orders.find((o) => o.id === currentOrder.id);
    if (updated) setCurrentOrder(updated);
    else setCurrentOrder(null);
  };

  const handlePrint = async () => {
    if (!currentOrder) return;
    await api.post(`/orders/${currentOrder.id}/print`);
  };

  const handlePayAndClose = async () => {
    if (!currentOrder) return;
    await api.post(`/orders/${currentOrder.id}/close`);
    setCurrentOrder(null);
  };

  const handleCancel = async () => {
    if (!currentOrder) return;
    await api.post(`/orders/${currentOrder.id}/cancel`, { reason: "Cancelled from terminal" });
    setCurrentOrder(null);
  };

  const handleExit = () => {
    navigate("/");
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
          <h1 className="text-white font-bold text-lg">{terminalName}</h1>
        </div>
        <div className="flex items-center gap-3">
          <PrinterSettings />
          <button
            onClick={handleExit}
            className="bg-red-600 hover:bg-red-500 text-white text-sm px-3 py-1 rounded"
          >
            Exit
          </button>
        </div>
      </header>

      <main className="flex-1 flex gap-4 p-4 overflow-hidden">
        <div className="flex-[3]">
          <ItemGrid
            items={items}
            onAddItem={handleAddItem}
          />
        </div>
        <div className="flex-[2]">
          <OrderPanel
            order={currentOrder}
            onPrint={handlePrint}
            onPayAndClose={handlePayAndClose}
            onCancel={handleCancel}
            onIncreaseQty={handleIncreaseQty}
            onDecreaseQty={handleDecreaseQty}
            onRemoveItem={handleRemoveItem}
          />
        </div>
      </main>
    </div>
  );
}

export default POSLayout;
