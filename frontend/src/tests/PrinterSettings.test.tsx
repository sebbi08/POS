import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import PrinterSettings from "../components/PrinterSettings";

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock });

describe("PrinterSettings", () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it("shows settings gear button in header", () => {
    render(<PrinterSettings />);
    const btn = screen.getByLabelText("Printer settings");
    expect(btn).toBeInTheDocument();
  });

  it("opens modal when gear button is clicked", () => {
    render(<PrinterSettings />);
    fireEvent.click(screen.getByLabelText("Printer settings"));
    expect(screen.getByText("Printer Settings")).toBeInTheDocument();
  });

  it("shows printer dropdown with select prompt", () => {
    render(<PrinterSettings />);
    fireEvent.click(screen.getByLabelText("Printer settings"));

    expect(screen.getByText("-- Select printer --")).toBeInTheDocument();
  });

  it("defaults paper width to 80mm", () => {
    render(<PrinterSettings />);
    fireEvent.click(screen.getByLabelText("Printer settings"));

    const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
    const paperSelect = selects[selects.length - 1];
    expect(paperSelect.value).toBe("80");
  });

  it("has Scan and Test Print buttons", () => {
    render(<PrinterSettings />);
    fireEvent.click(screen.getByLabelText("Printer settings"));

    expect(screen.getByText("Scan")).toBeInTheDocument();
    expect(screen.getByText("Test Print")).toBeInTheDocument();
  });

  it("loads saved printers from localStorage", () => {
    localStorageMock.setItem("pos-printer-settings", JSON.stringify({
      printers: [
        { vendorId: 1046, productId: 20497, name: "Epson TM-T88V (0x0416:0x5011)" },
      ],
      selectedIndex: 0,
      paperWidth: "58",
    }));

    render(<PrinterSettings />);
    fireEvent.click(screen.getByLabelText("Printer settings"));

    expect(screen.getAllByText("Epson TM-T88V (0x0416:0x5011)").length).toBeGreaterThanOrEqual(1);
    const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
    expect(selects[0].value).toBe("0");
    expect(selects[selects.length - 1].value).toBe("58");
  });

  it("closes modal when Close is clicked", () => {
    render(<PrinterSettings />);
    fireEvent.click(screen.getByLabelText("Printer settings"));
    expect(screen.getByText("Printer Settings")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Close"));
    expect(screen.queryByText("Printer Settings")).not.toBeInTheDocument();
  });
});
