import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import ItemGrid from "../components/ItemGrid";
import OrderPanel from "../components/OrderPanel";
import PrinterSettings from "../components/PrinterSettings";
import {
  getEncoderOptions,
  getPrintWidth,
  wrapPrintData,
} from "../utils/printer";

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
  items: {
    itemId: string;
    name: string;
    qty: number;
    unitPrice: number;
    total: number;
  }[];
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

    const items = await api.get<TerminalItem[]>(
      `/terminals/${terminalId}/items`,
    );
    setItems(items);

    const orders = await api.get<Order[]>(`/orders?terminalId=${terminalId}`);
    const open = orders.find((o) => o.status === "open");
    if (open) setCurrentOrder(open);

    setLoading(false);
  }, [terminalId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAddItem = async (itemId: string) => {
    if (!terminalId) return;
    let order = currentOrder;
    if (!order) {
      try {
        const data = await api.post<{ id: string }>("/orders/open", {
          terminalId,
        });
        order = { id: data.id, status: "open", items: [] };
        setCurrentOrder(order);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("409")) {
          const orders = await api.get<Order[]>(
            `/orders?terminalId=${terminalId}`,
          );
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

    const result = await api.post<{
      status: string;
      order: {
        id: string;
        items: {
          name: string;
          qty: number;
          total: number;
          vatRate: number;
          vatAmount: number;
        }[];
        totalGross: number;
        totalVat: Record<number, number>;
      };
      company: { name: string; address: string; city: string; vatId: string };
    }>(`/orders/${currentOrder.id}/print`);

    const printerSettings = JSON.parse(
      localStorage.getItem("pos-printer-settings") || "{}",
    );
    const selectedIndex = printerSettings.selectedIndex;
    if (selectedIndex < 0 || !printerSettings.printers?.[selectedIndex]) return;

    const printer = printerSettings.printers[selectedIndex];
    let device: any = null;

    try {
      const devices = await (navigator as any).usb.getDevices();
      device = devices.find(
        (d: any) =>
          d.vendorId === printer.vendorId && d.productId === printer.productId,
      );

      if (!device) {
        device = await (navigator as any).usb.requestDevice({
          filters: [
            { vendorId: printer.vendorId, productId: printer.productId },
          ],
        });
      }

      if (!device) return;

      await device.open();
      await device.selectConfiguration(1);
      await device.claimInterface(0);

      const iface = device.configuration?.interfaces.find(
        (i: any) => i.interfaceNumber === 0,
      );
      const endpoint = iface?.alternate.endpoints.find(
        (e: any) => e.direction === "out",
      );

      if (!endpoint) return;

      const { default: ReceiptPrinterEncoder } =
        await import("@point-of-sale/receipt-printer-encoder");
      const w = getPrintWidth(printerSettings.paperWidth);
      const { company, order: orderData } = result;
      const now = new Date().toLocaleString("de-DE");
      const line = "─".repeat(w);

      const writeEncoder = async (encoder: any) => {
        const paddedData = wrapPrintData(encoder.encode());
        await device.transferOut(endpoint.endpointNumber, paddedData);
      };

      const printCompanyHeader = (encoder: any) => {
        if (company.name) {
          encoder
            .align("center")
            .bold(true)
            .text(company.name)
            .bold(false)
            .newline();
          if (company.address) encoder.text(company.address).newline();
          if (company.city) encoder.text(company.city).newline();
          if (company.vatId) encoder.text(`USt-ID: ${company.vatId}`).newline();
          encoder.align("left");
        }
      };

      // --- Final Receipt ---
      {
        const encoder = new ReceiptPrinterEncoder(getEncoderOptions(w));
        encoder.initialize().newline();

        printCompanyHeader(encoder);

        encoder.newline().line(line).newline().newline();
        encoder
          .align("center")
          .bold(true)
          .text("Final Receipt")
          .bold(false)
          .newline()
          .newline();
        encoder.align("left");

        for (const item of orderData.items) {
          const left = `${item.qty} x ${item.name}`;
          const right = `${item.total.toFixed(2)} EUR`;
          if (left.length + right.length + 1 <= w) {
            const pad = w - left.length - right.length;
            encoder.text(left + " ".repeat(pad) + right).newline();
          } else {
            encoder.text(`${item.qty}x ${item.name}`).newline();
            encoder
              .align("right")
              .text(`${item.total.toFixed(2)}EUR`)
              .align("left")
              .newline();
          }
        }

        encoder.newline().line(line).newline().newline();

        const vatEntries = Object.entries(orderData.totalVat);
        if (vatEntries.length > 0) {
          for (const [rate, amount] of vatEntries) {
            const left = `VAT ${rate}%:`;
            const right = `${amount.toFixed(2)} EUR`;
            const pad = w - left.length - right.length;
            encoder.text(left + " ".repeat(Math.max(0, pad)) + right).newline();
          }
          encoder.newline().line(line).newline().newline();
        }

        encoder
          .align("center")
          .bold(true)
          .text(`Total: ${orderData.totalGross.toFixed(2)} EUR`)
          .bold(false)
          .newline();
        encoder.align("left");

        encoder.newline().newline().newline().newline();
        encoder.align("center");
        encoder
          .text(`Order #${orderData.id.slice(0, 8)} \u00b7 ${terminalId}`)
          .newline();
        encoder.text(now).newline();
        encoder.align("left");

        encoder.newline().newline().newline().newline().newline().cut();
        await writeEncoder(encoder);
      }

      // --- Pickup Receipts (one per item) ---
      for (let i = 0; i < orderData.items.length; i++) {
        const item = orderData.items[i];
        const encoder = new ReceiptPrinterEncoder(getEncoderOptions(w));
        encoder.initialize().newline();

        printCompanyHeader(encoder);

        encoder.newline().line(line).newline().newline();
        encoder
          .align("center")
          .bold(true)
          .text(`Pickup #${i + 1}`)
          .bold(false)
          .newline()
          .newline();
        encoder.align("left");

        const left = `${item.qty} x ${item.name}`;
        const pad = Math.max(0, (w - left.length) / 2);
        encoder.text(" ".repeat(Math.floor(pad)) + left).newline();

        encoder.newline().line(line).newline().newline();
        encoder.align("center");
        encoder
          .text(`Order #${orderData.id.slice(0, 8)} \u00b7 ${terminalId}`)
          .newline();
        encoder.text(now).newline();
        encoder.align("left");

        encoder.newline().newline().newline().newline().cut();
        await writeEncoder(encoder);
      }
    } catch (err) {
      console.error("Print failed:", err);
    } finally {
      if (device) {
        try {
          await device.close();
        } catch {}
      }
    }
  };

  const handlePayAndClose = async () => {
    if (!currentOrder) return;
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
          <ItemGrid items={items} onAddItem={handleAddItem} />
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
