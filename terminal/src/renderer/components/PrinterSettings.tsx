import { useEffect, useState } from "react";
import type { SavedPrinter, TerminalSettings, UsbDeviceChoice } from "../../shared/types";
import { encodeJob } from "../print/encode";
import type { ReceiptLine } from "../print/layout";
import { PrintError, printJobs } from "../print/usb";

interface Props {
  settings: TerminalSettings;
  onSave: (next: TerminalSettings) => void;
}

const hex = (n: number) => `0x${n.toString(16).toUpperCase()}`;

function printerName(d: { productName?: string; vendorId: number; productId: number }): string {
  const ids = `${hex(d.vendorId)}:${hex(d.productId)}`;
  return d.productName ? `${d.productName} (${ids})` : ids;
}

function testPage(paperWidth: "58" | "80"): ReceiptLine[] {
  return [
    { kind: "blank" }, { kind: "rule" }, { kind: "blank" },
    { kind: "text", text: "Testdruck", align: "center", bold: true },
    { kind: "blank" }, { kind: "rule" }, { kind: "blank" }, { kind: "blank" },
    { kind: "text", text: `Breite: ${paperWidth} mm`, align: "left" },
    ...Array.from({ length: 8 }, (): ReceiptLine => ({ kind: "blank" })),
    { kind: "cut" },
  ];
}

function PrinterSettings({ settings, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [printer, setPrinter] = useState<SavedPrinter | null>(settings.printer);
  const [paperWidth, setPaperWidth] = useState<"58" | "80">(settings.paperWidth);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [choices, setChoices] = useState<UsbDeviceChoice[] | null>(null);

  const openDialog = () => {
    setPrinter(settings.printer);
    setPaperWidth(settings.paperWidth);
    setMessage(null);
    setChoices(null);
    setOpen(true);
  };

  // Main sends the device list while a search (navigator.usb.requestDevice) is pending.
  useEffect(() => {
    if (!open) return;
    return window.terminal.onUsbChoose(setChoices);
  }, [open]);

  const handleSearch = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const device = await (navigator as unknown as {
        usb: { requestDevice(o: { filters: unknown[] }): Promise<{ vendorId: number; productId: number; productName?: string } | undefined> };
      }).usb.requestDevice({ filters: [] });
      if (device) {
        setPrinter({ vendorId: device.vendorId, productId: device.productId, name: printerName(device) });
        setMessage({ text: "Drucker übernommen – zum Behalten speichern", error: false });
      }
    } catch (err) {
      if (!(err instanceof Error) || err.name !== "NotFoundError") {
        setMessage({ text: err instanceof Error ? err.message : "Drucker konnte nicht hinzugefügt werden", error: true });
      }
    } finally {
      setChoices(null);
      setBusy(false);
    }
  };

  const answer = (deviceId: string | null) => {
    setChoices(null);
    void window.terminal.chooseUsb(deviceId);
  };

  const handleTestPrint = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const width = paperWidth === "58" ? 32 : 42;
      await printJobs(printer, [encodeJob(testPage(paperWidth), width)]);
      setMessage({ text: "Testdruck gesendet", error: false });
    } catch (err) {
      const text = err instanceof PrintError ? err.message : `Drucken fehlgeschlagen: ${String(err)}`;
      setMessage({ text, error: true });
    } finally {
      setBusy(false);
    }
  };

  const handleSave = () => {
    onSave({ ...settings, printer, paperWidth });
    setOpen(false);
  };

  return (
    <>
      <button
        onClick={openDialog}
        className="text-gray-400 hover:text-white text-sm px-2 py-1 rounded hover:bg-gray-700 transition-colors"
        aria-label="Druckereinstellungen"
      >
        &#9881;
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-800 rounded-xl p-6 w-96 shadow-2xl">
            <h2 className="text-white text-lg font-bold mb-4">Druckereinstellungen</h2>

            <div className="space-y-4">
              <div>
                <span className="text-gray-400 text-xs block mb-1">Drucker</span>
                <div className="flex items-center gap-2">
                  <div className="flex-1 flex items-center justify-between bg-gray-700 rounded-lg px-3 py-2">
                    {printer ? (
                      <>
                        <span className="text-white text-sm truncate">{printer.name}</span>
                        <button
                          onClick={() => setPrinter(null)}
                          className="text-red-400 hover:text-red-300 text-sm ml-2"
                          aria-label="Drucker entfernen"
                        >
                          ×
                        </button>
                      </>
                    ) : (
                      <span className="text-gray-400 text-sm">Kein Drucker eingerichtet</span>
                    )}
                  </div>
                  <button
                    onClick={handleSearch}
                    disabled={busy}
                    className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg px-3 py-2 text-sm transition-colors"
                  >
                    {busy && !choices ? "..." : "Suchen"}
                  </button>
                </div>
              </div>

              {choices && (
                <div className="space-y-1">
                  <span className="text-gray-400 text-xs block">USB-Geräte</span>
                  {choices.length === 0 && (
                    <div className="text-gray-400 text-sm">Keine USB-Geräte gefunden</div>
                  )}
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {choices.map((d) => (
                      <button
                        key={d.deviceId}
                        onClick={() => answer(d.deviceId)}
                        className="w-full text-left bg-gray-700 hover:bg-gray-600 text-white text-sm rounded px-2 py-1"
                      >
                        {printerName(d)}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => answer(null)}
                    className="text-gray-300 hover:text-white text-sm underline"
                  >
                    Abbrechen
                  </button>
                </div>
              )}

              <div>
                <label htmlFor="paper-width" className="text-gray-400 text-xs block mb-1">Papierbreite</label>
                <select
                  id="paper-width"
                  value={paperWidth}
                  onChange={(e) => setPaperWidth(e.target.value === "58" ? "58" : "80")}
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="58">58 mm</option>
                  <option value="80">80 mm</option>
                </select>
              </div>

              {message && (
                <div
                  className={`text-sm text-center rounded-lg p-2 ${message.error ? "bg-red-500/20 text-red-300" : "bg-green-500/20 text-green-300"}`}
                >
                  {message.text}
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 mt-6">
              <button
                onClick={handleTestPrint}
                disabled={busy || !printer}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg py-2 text-sm transition-colors"
              >
                Testdruck
              </button>
              <button
                onClick={handleSave}
                className="bg-green-700 hover:bg-green-600 text-white rounded-lg py-2 text-sm transition-colors"
              >
                Speichern
              </button>
              <button
                onClick={() => setOpen(false)}
                className="bg-red-900 hover:bg-red-800 text-red-300 rounded-lg py-2 text-sm transition-colors"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default PrinterSettings;
