import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TouchDialog } from "@/components/ui/touch-dialog";
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

  const searching = useRef(false);

  /** Answers a pending chooser so requestDevice in main/renderer never hangs. */
  const cancelSearch = () => {
    if (!searching.current) return;
    searching.current = false;
    void window.terminal.chooseUsb(null);
  };

  const openDialog = () => {
    setBusy(false);
    setPrinter(settings.printer);
    setPaperWidth(settings.paperWidth);
    setMessage(null);
    setChoices(null);
    setOpen(true);
  };

  // Main sends the device list while a search (navigator.usb.requestDevice) is pending.
  useEffect(() => {
    if (!open) return;
    const unsubscribe = window.terminal.onUsbChoose(setChoices);
    return () => {
      unsubscribe();
      cancelSearch();
    };
  }, [open]);

  const handleSearch = async () => {
    setBusy(true);
    setMessage(null);
    searching.current = true;
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
      searching.current = false;
      setChoices(null);
      setBusy(false);
    }
  };

  const answer = (deviceId: string | null) => {
    searching.current = false;
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
      <Button
        type="button"
        variant="ghost"
        size="touch"
        onClick={openDialog}
        className="text-2xl text-muted-foreground"
        aria-label="Druckereinstellungen"
      >
        &#9881;
      </Button>

      {open && (
        <TouchDialog title="Druckereinstellungen" onClose={() => setOpen(false)} className="w-[28rem]">
          <div className="space-y-4">
            <div>
              <span className="text-muted-foreground text-xs block mb-1">Drucker</span>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0 min-h-12 flex items-center justify-between bg-muted rounded-lg pl-3">
                  {printer ? (
                    <>
                      <span className="text-sm truncate">{printer.name}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="touch"
                        onClick={() => setPrinter(null)}
                        className="text-xl text-destructive"
                        aria-label="Drucker entfernen"
                      >
                        ×
                      </Button>
                    </>
                  ) : (
                    <span className="text-muted-foreground text-sm">Kein Drucker eingerichtet</span>
                  )}
                </div>
                <Button type="button" size="touch" onClick={handleSearch} disabled={busy}>
                  {busy && !choices ? "..." : "Suchen"}
                </Button>
              </div>
            </div>

            {choices && (
              <div className="space-y-1">
                <span className="text-muted-foreground text-xs block">USB-Geräte</span>
                {choices.length === 0 && (
                  <div className="text-muted-foreground text-sm">Keine USB-Geräte gefunden</div>
                )}
                <div className="max-h-52 overflow-y-auto space-y-1">
                  {choices.map((d) => (
                    <Button
                      key={d.deviceId}
                      type="button"
                      variant="secondary"
                      size="touch"
                      onClick={() => answer(d.deviceId)}
                      className="w-full justify-start text-sm"
                    >
                      {printerName(d)}
                    </Button>
                  ))}
                </div>
                <Button type="button" variant="secondary" size="touch" onClick={() => answer(null)}>
                  Abbrechen
                </Button>
              </div>
            )}

            <div>
              <Label htmlFor="paper-width" className="text-muted-foreground text-xs font-normal mb-1">Papierbreite</Label>
              <select
                id="paper-width"
                value={paperWidth}
                onChange={(e) => setPaperWidth(e.target.value === "58" ? "58" : "80")}
                className="w-full h-12 rounded-md border border-input bg-input/30 px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
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

          <div className="grid grid-cols-3 gap-2 mt-2">
            <Button type="button" variant="secondary" size="touch" onClick={handleTestPrint} disabled={busy || !printer}>
              Testdruck
            </Button>
            <Button type="button" size="touch" onClick={handleSave}>
              Speichern
            </Button>
            <Button type="button" variant="secondary" size="touch" onClick={() => setOpen(false)}>
              Schließen
            </Button>
          </div>
        </TouchDialog>
      )}
    </>
  );
}

export default PrinterSettings;
