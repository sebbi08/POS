import { useEffect, useState } from "react";
import { getPrintWidth, wrapPrintData, getEncoderOptions } from "../utils/printer";

interface SavedPrinter {
  vendorId: number;
  productId: number;
  name: string;
}

interface Settings {
  printers: SavedPrinter[];
  selectedIndex: number;
  paperWidth: string;
}

const STORAGE_KEY = "pos-printer-settings";

function loadSettings(): Settings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return { printers: [], selectedIndex: -1, paperWidth: "80" };
}

function saveSettings(settings: Settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function PrinterSettings() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [connecting, setConnecting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const handleScan = async () => {
    setConnecting(true);
    setMessage("");
    try {
      const device = await (navigator as any).usb.requestDevice({
        filters: [],
      });
      if (device) {
        const name = device.productName
          ? `${device.productName} (0x${device.vendorId.toString(16).toUpperCase()}:0x${device.productId.toString(16).toUpperCase()})`
          : `0x${device.vendorId.toString(16).toUpperCase()}:0x${device.productId.toString(16).toUpperCase()}`;

        const newPrinter: SavedPrinter = {
          vendorId: device.vendorId,
          productId: device.productId,
          name,
        };

        const exists = settings.printers.findIndex(
          (p) =>
            p.vendorId === newPrinter.vendorId &&
            p.productId === newPrinter.productId,
        );

        if (exists >= 0) {
          setSettings({ ...settings, selectedIndex: exists });
          setMessage("Printer already in list");
        } else {
          const printers = [...settings.printers, newPrinter];
          setSettings({
            ...settings,
            printers,
            selectedIndex: printers.length - 1,
          });
          setMessage("Printer added");
        }
      }
    } catch (err: any) {
      if (err.name !== "NotFoundError") {
        setMessage(err.message || "Could not add printer");
      }
    }
    setConnecting(false);
  };

  const handleTestPrint = async () => {
    if (settings.selectedIndex < 0) {
      setMessage("Select a printer first");
      return;
    }
    const printer = settings.printers[settings.selectedIndex];
    setConnecting(true);
    setMessage("");
    let device: any = null;
    try {
      const { default: ReceiptPrinterEncoder } =
        await import("@point-of-sale/receipt-printer-encoder");

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

      if (!device) {
        setMessage("Printer not found");
        setConnecting(false);
        return;
      }

      await device.open();
      await device.selectConfiguration(1);
      await device.claimInterface(0);

      const iface = device.configuration?.interfaces.find(
        (i: any) => i.interfaceNumber === 0,
      );
      const endpoint = iface?.alternate.endpoints.find(
        (e: any) => e.direction === "out",
      );

      if (!endpoint) {
        throw new Error("No OUT endpoint found");
      }

      const width = getPrintWidth(settings.paperWidth);
      const encoder = new ReceiptPrinterEncoder(getEncoderOptions(width));

      const line = "─".repeat(width);
      const data = encoder
        .initialize()
        .newline()
        .line(line)
        .newline()
        .align("center")
        .bold(true)
        .text("Test Print")
        .bold(false)
        .newline()
        .line(line)
        .newline()
        .newline()
        .align("left")
        .text(`Width: ${settings.paperWidth}mm`)
        .newline()
        .newline()
        .newline()
        .newline()
        .newline()
        .newline()
        .newline()
        .newline()
        .cut()
        .encode();

      const paddedData = wrapPrintData(data);
      await device.transferOut(endpoint.endpointNumber, paddedData);
      setMessage("Test print sent");
    } catch (err: any) {
      setMessage(err.message || "Print failed");
    } finally {
      if (device) {
        try {
          await device.close();
        } catch {}
      }
      setConnecting(false);
    }
  };

  const handleRemove = (index: number) => {
    const printers = settings.printers.filter((_, i) => i !== index);
    const selectedIndex =
      index === settings.selectedIndex
        ? -1
        : settings.selectedIndex > index
          ? settings.selectedIndex - 1
          : settings.selectedIndex;
    setSettings({ ...settings, printers, selectedIndex });
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-gray-400 hover:text-white text-sm px-2 py-1 rounded hover:bg-gray-700 transition-colors"
        aria-label="Printer settings"
      >
        &#9881;
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-800 rounded-xl p-6 w-96 shadow-2xl">
            <h2 className="text-white text-lg font-bold mb-4">
              Printer Settings
            </h2>

            <div className="space-y-4">
              <div>
                <label className="text-gray-400 text-xs block mb-1">
                  Printer
                </label>
                <div className="flex gap-2">
                  <select
                    value={settings.selectedIndex}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        selectedIndex: Number(e.target.value),
                      })
                    }
                    className="flex-1 bg-gray-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value={-1}>-- Select printer --</option>
                    {settings.printers.map((p, i) => (
                      <option key={i} value={i}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleScan}
                    disabled={connecting}
                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg px-3 py-2 text-sm transition-colors"
                  >
                    {connecting ? "..." : "Scan"}
                  </button>
                </div>
              </div>

              {settings.printers.length > 0 && (
                <div className="max-h-24 overflow-y-auto space-y-1">
                  {settings.printers.map((p, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between bg-gray-700 rounded px-2 py-1"
                    >
                      <span className="text-white text-xs truncate flex-1">
                        {p.name}
                      </span>
                      <button
                        onClick={() => handleRemove(i)}
                        className="text-red-400 hover:text-red-300 text-xs ml-2"
                        aria-label="Remove printer"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label className="text-gray-400 text-xs block mb-1">
                  Paper Width
                </label>
                <select
                  value={settings.paperWidth}
                  onChange={(e) =>
                    setSettings({ ...settings, paperWidth: e.target.value })
                  }
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="58">58mm</option>
                  <option value="80">80mm</option>
                </select>
              </div>

              {message && (
                <div
                  className={`text-sm text-center rounded-lg p-2 ${message.includes("failed") || message.includes("not connect") || message.includes("Could not") ? "bg-red-500/20 text-red-300" : "bg-green-500/20 text-green-300"}`}
                >
                  {message}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 mt-6">
              <button
                onClick={handleTestPrint}
                disabled={connecting || settings.selectedIndex < 0}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg py-2 text-sm transition-colors"
              >
                {connecting ? "..." : "Test Print"}
              </button>
              <button
                onClick={() => setOpen(false)}
                className="bg-red-900 hover:bg-red-800 text-red-300 rounded-lg py-2 text-sm transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default PrinterSettings;
