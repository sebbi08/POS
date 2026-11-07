import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import PrinterSettings from "./PrinterSettings";
import type { TerminalSettings } from "../../shared/types";

const base: TerminalSettings = {
  serverUrl: "", terminalId: "t1", terminalKey: "k", changeCalculator: false,
  printer: null, paperWidth: "80", lastCatalogFetchAt: null, clockSkewMs: null,
};

type Devices = { deviceId: string; productName?: string; vendorId: number; productId: number }[];
let chooseCb: ((d: Devices) => void) | null = null;
const unsubscribe = vi.fn();
const chooseUsb = vi.fn();
const requestDevice = vi.fn();

beforeEach(() => {
  chooseCb = null;
  vi.clearAllMocks();
  (window as unknown as { terminal: unknown }).terminal = {
    onUsbChoose: (cb: (d: Devices) => void) => { chooseCb = cb; return unsubscribe; },
    chooseUsb,
  };
  Object.defineProperty(navigator, "usb", { configurable: true, value: { requestDevice } });
});

const open = () => fireEvent.click(screen.getByLabelText("Druckereinstellungen"));

describe("PrinterSettings", () => {
  it("opens and closes the dialog", () => {
    render(<PrinterSettings settings={base} onSave={vi.fn()} />);
    expect(screen.queryByText("Druckereinstellungen")).not.toBeInTheDocument();
    open();
    expect(screen.getByText("Druckereinstellungen")).toBeInTheDocument();
    expect(screen.getByText("Kein Drucker eingerichtet")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Schließen"));
    expect(screen.queryByText("Druckereinstellungen")).not.toBeInTheDocument();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("shows the saved printer and paper width", () => {
    render(<PrinterSettings settings={{ ...base, printer: { vendorId: 1, productId: 2, name: "Epson" }, paperWidth: "58" }} onSave={vi.fn()} />);
    open();
    expect(screen.getByText("Epson")).toBeInTheDocument();
    expect((screen.getByLabelText("Papierbreite") as HTMLSelectElement).value).toBe("58");
  });

  it("saves the printer picked from the search list", async () => {
    const onSave = vi.fn();
    requestDevice.mockImplementation(() => new Promise((resolve) => {
      chooseUsb.mockImplementation(async (id: string | null) => {
        resolve(id ? { vendorId: 0x416, productId: 0x5011, productName: "TM-T88V" } : undefined);
      });
    }));
    render(<PrinterSettings settings={base} onSave={onSave} />);
    open();
    fireEvent.click(screen.getByText("Suchen"));
    await act(async () => {
      chooseCb?.([{ deviceId: "d1", productName: "TM-T88V", vendorId: 0x416, productId: 0x5011 }]);
    });
    await act(async () => { fireEvent.click(screen.getByText("TM-T88V (0x416:0x5011)")); });
    expect(chooseUsb).toHaveBeenCalledWith("d1");
    fireEvent.click(screen.getByText("Speichern"));
    expect(onSave).toHaveBeenCalledWith({
      ...base, paperWidth: "80",
      printer: { vendorId: 0x416, productId: 0x5011, name: "TM-T88V (0x416:0x5011)" },
    });
  });

  it("cancelling the search list answers null and keeps the printer", async () => {
    requestDevice.mockImplementation(() => new Promise((resolve) => {
      chooseUsb.mockImplementation(async () => { resolve(undefined); });
    }));
    const onSave = vi.fn();
    render(<PrinterSettings settings={base} onSave={onSave} />);
    open();
    fireEvent.click(screen.getByText("Suchen"));
    await act(async () => { chooseCb?.([]); });
    await act(async () => { fireEvent.click(screen.getByText("Abbrechen")); });
    expect(chooseUsb).toHaveBeenCalledWith(null);
    fireEvent.click(screen.getByText("Speichern"));
    expect(onSave).toHaveBeenCalledWith({ ...base, printer: null });
  });

  it("saves the chosen paper width and can remove the printer", () => {
    const onSave = vi.fn();
    render(<PrinterSettings settings={{ ...base, printer: { vendorId: 1, productId: 2, name: "Epson" } }} onSave={onSave} />);
    open();
    fireEvent.change(screen.getByLabelText("Papierbreite"), { target: { value: "58" } });
    fireEvent.click(screen.getByLabelText("Drucker entfernen"));
    fireEvent.click(screen.getByText("Speichern"));
    expect(onSave).toHaveBeenCalledWith({ ...base, printer: null, paperWidth: "58" });
  });

  it("disables the test print without a printer", () => {
    render(<PrinterSettings settings={base} onSave={vi.fn()} />);
    open();
    expect(screen.getByText("Testdruck")).toBeDisabled();
  });
});
