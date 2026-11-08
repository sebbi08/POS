import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CatalogManager from "../components/CatalogManager";
import AdminLayout from "../views/AdminLayout";
import TransactionHistory from "../components/TransactionHistory";
import ReportOverview from "../components/ReportOverview";
import TerminalConfig from "../components/TerminalConfig";
import CatalogImportExport from "../components/CatalogImportExport";

const emptyReport = {
  from: "2026-05-13", to: "2026-05-13", orderCount: 0, cancelledCount: 0,
  totalGross: 0, totalVat: 0, totalNet: 0,
  vatByGroup: {}, byTerminal: {}, topItems: [],
};

// toLocaleString emits a non-breaking space before the currency sign; normalise for matching.
const eur = (n: number) =>
  n.toLocaleString("de-DE", { style: "currency", currency: "EUR" }).replace(/\s/g, " ");

vi.mock("../api/client", () => ({
  api: {
    get: vi.fn((_path: string) => {
      if (_path.startsWith("/reporting/summary")) {
        return Promise.resolve({
          from: "2026-05-13", to: "2026-05-13", orderCount: 0, cancelledCount: 0,
          totalGross: 0, totalVat: 0, totalNet: 0,
          vatByGroup: {}, byTerminal: {}, topItems: [],
        });
      }
      return Promise.resolve([]);
    }),
    post: vi.fn().mockResolvedValue({ id: "new-id" }),
    put: vi.fn().mockResolvedValue({ status: "updated" }),
    delete: vi.fn().mockResolvedValue({ status: "deleted" }),
    upload: vi.fn().mockResolvedValue({}),
    downloadCsv: vi.fn().mockResolvedValue(undefined),
    clearAdminPin: vi.fn(),
  },
}));

import { api } from "../api/client";

describe("CatalogManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows group list with VAT rates", async () => {
    vi.mocked(api.get).mockResolvedValueOnce([
      { id: "g1", name: "Hot Drinks", vatRate: 19 },
      { id: "g2", name: "Food", vatRate: 7 },
    ]);
    render(<CatalogManager type="groups" />);
    await waitFor(() => {
      expect(screen.getByText("Hot Drinks")).toBeInTheDocument();
      expect(screen.getByText("19%")).toBeInTheDocument();
    });
  });

  it("shows item list with group names and prices", async () => {
    vi.mocked(api.get).mockResolvedValueOnce([
      { id: "g1", name: "Hot Drinks", vatRate: 19 },
    ]);
    vi.mocked(api.get).mockResolvedValueOnce([
      { id: "i1", name: "Espresso", groupId: "g1", price: 2.50 },
    ]);
    render(<CatalogManager type="items" />);
    await waitFor(() => {
      expect(screen.getByText("Espresso")).toBeInTheDocument();
      expect(screen.getByText(eur(2.5))).toBeInTheDocument();
    });
  });

  it("Löschen button calls DELETE", async () => {
    vi.mocked(api.get).mockResolvedValueOnce([
      { id: "g1", name: "Drinks", vatRate: 19 },
    ]);
    render(<CatalogManager type="groups" />);
    await waitFor(() => screen.getByText("Drinks"));

    fireEvent.click(screen.getByText("Löschen"));
    expect(api.delete).toHaveBeenCalledWith("/catalog/groups/g1");
  });
});

describe("AdminLayout", () => {
  it("tabs are German", () => {
    render(<MemoryRouter><AdminLayout /></MemoryRouter>);
    for (const label of ["Auswertung", "Buchungen", "Warengruppen", "Artikel", "Terminals", "Firmendaten", "Import/Export"]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("no longer has Users tab", () => {
    render(<MemoryRouter><AdminLayout /></MemoryRouter>);
    expect(screen.queryByText("Users")).not.toBeInTheDocument();
  });

  it("Abmelden button is present", () => {
    render(<MemoryRouter><AdminLayout /></MemoryRouter>);
    expect(screen.getByText("Abmelden")).toBeInTheDocument();
  });

  it("header shows server version", async () => {
    const original = vi.mocked(api.get).getMockImplementation()!;
    vi.mocked(api.get).mockImplementation((path: string) =>
      path === "/version" ? Promise.resolve({ version: "0.2.0" }) : original(path),
    );
    try {
      render(<MemoryRouter><AdminLayout /></MemoryRouter>);
      expect(await screen.findByText("v0.2.0")).toBeInTheDocument();
    } finally {
      vi.mocked(api.get).mockImplementation(original);
    }
  });

  it("opens on the Auswertung tab", async () => {
    render(<MemoryRouter><AdminLayout /></MemoryRouter>);
    expect(await screen.findByRole("heading", { name: "Auswertung" })).toBeInTheDocument();
  });
});

describe("TransactionHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const closedRow = { orderId: "abc12345-1234", terminalId: "t1", items: "1x Espresso", itemCount: 1, totalGross: 2.5, totalVat: 0.4, status: "closed", closedAt: "2026-01-01T12:00:00Z" };
  const cancelRow = { orderId: "def67890-5678", terminalId: "t1", items: "2x Latte", itemCount: 2, totalGross: -7, totalVat: -1.1, status: "cancelled", title: "Storno zu #abc12345", cancelsOrderId: "abc12345-1234", closedAt: "2026-01-01T12:05:00Z" };

  const mockLists = (rows: unknown[]) => {
    vi.mocked(api.get).mockImplementation((path: string) =>
      Promise.resolve(path.startsWith("/terminals") ? [{ id: "t1", name: "Bar", groupIds: [], printPickupReceipts: true }] : rows) as never,
    );
  };

  it("shows terminal names, status badges and prices", async () => {
    mockLists([closedRow, cancelRow]);
    render(<TransactionHistory />);
    await waitFor(() => {
      expect(screen.getAllByRole("cell", { name: "Bar" })).toHaveLength(2);
      expect(screen.getByText("Storno zu #abc12345")).toBeInTheDocument();
      expect(screen.getByText(eur(-7))).toBeInTheDocument();
    });
    expect(screen.getByText("Abgeschlossen", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("Storniert", { selector: "span" })).toBeInTheDocument();
  });

  it("requests the selected range", async () => {
    mockLists([]);
    render(<TransactionHistory />);
    fireEvent.change(screen.getByLabelText("Von"), { target: { value: "2026-06-01" } });
    fireEvent.change(screen.getByLabelText("Bis"), { target: { value: "2026-06-02" } });
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith(expect.stringMatching(/^\/reporting\/transactions\?from=2026-06-01&to=2026-06-02(&|$)/));
    });
  });

  it("has no open status and shows German empty state", async () => {
    mockLists([]);
    render(<TransactionHistory />);
    expect(await screen.findByText("Keine Buchungen gefunden")).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /offen/i })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Suche nach Buchung oder Artikel...")).toBeInTheDocument();
  });

  it("Stornieren is offered only for closed originals, after confirmation", async () => {
    mockLists([closedRow, cancelRow]);
    const confirm = vi.fn().mockReturnValue(true);
    vi.stubGlobal("confirm", confirm);
    render(<TransactionHistory />);
    const buttons = await screen.findAllByRole("button", { name: "Stornieren" });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(confirm).toHaveBeenCalledWith("Buchung #abc12345 wirklich stornieren?");
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/orders/abc12345-1234/cancel", expect.anything()));
  });

  it("ignores a slower earlier response that arrives after a newer one", async () => {
    let resolveFirst: (rows: unknown[]) => void = () => {};
    const first = new Promise<unknown[]>((r) => { resolveFirst = r; });
    let call = 0;
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.startsWith("/terminals")) return Promise.resolve([]) as never;
      call += 1;
      return (call === 1 ? first : Promise.resolve([cancelRow])) as never;
    });
    render(<TransactionHistory />);
    fireEvent.change(screen.getByLabelText("Von"), { target: { value: "2026-06-01" } });
    await screen.findByText("Storno zu #abc12345");
    resolveFirst([closedRow]);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("button", { name: "Stornieren" })).not.toBeInTheDocument();
    expect(screen.getByText("Storno zu #abc12345")).toBeInTheDocument();
  });

  it("does not cancel when the confirmation is declined", async () => {
    mockLists([closedRow]);
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
    render(<TransactionHistory />);
    fireEvent.click(await screen.findByRole("button", { name: "Stornieren" }));
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe("ReportOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockReport = (report: unknown) => {
    vi.mocked(api.get).mockImplementation((path: string) =>
      Promise.resolve(
        path.startsWith("/terminals")
          ? [{ id: "t1", name: "Bar", groupIds: [], printPickupReceipts: true }]
          : report,
      ) as never,
    );
  };

  it("report tab requests summary for selected range", async () => {
    mockReport(emptyReport);
    render(<ReportOverview />);
    await screen.findByRole("heading", { name: "Auswertung" });
    fireEvent.change(screen.getByLabelText("Von"), { target: { value: "2026-06-01" } });
    fireEvent.change(screen.getByLabelText("Bis"), { target: { value: "2026-06-02" } });
    await waitFor(() => {
      expect(api.get).toHaveBeenCalledWith("/reporting/summary?from=2026-06-01&to=2026-06-02");
    });
  });

  it("defaults both dates to today", async () => {
    mockReport(emptyReport);
    render(<ReportOverview />);
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    expect(screen.getByLabelText("Von")).toHaveValue(today);
    expect(screen.getByLabelText("Bis")).toHaveValue(today);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith(`/reporting/summary?from=${today}&to=${today}`));
  });

  it("shows summary cards, terminal names and top items in German", async () => {
    mockReport({
      ...emptyReport,
      orderCount: 47,
      cancelledCount: 2,
      totalGross: 873.5,
      totalVat: 112.3,
      totalNet: 761.2,
      vatByGroup: { "19": { rate: 19, gross: 500, vat: 79.83 } },
      byTerminal: { t1: { orderCount: 30, total: 500 } },
      topItems: [{ itemId: "i1", name: "Espresso", count: 45 }],
    });
    render(<ReportOverview />);
    await waitFor(() => {
      expect(screen.getByText("47")).toBeInTheDocument();
      expect(screen.getByText(eur(873.5))).toBeInTheDocument();
      expect(screen.getByText("Meistverkaufte Artikel")).toBeInTheDocument();
      expect(screen.getByText(/Espresso/)).toBeInTheDocument();
      expect(screen.getByText("Bar")).toBeInTheDocument();
      expect(screen.getByText(/2 stornierte Buchung/)).toBeInTheDocument();
    });
  });

  it("shows the backend error for an invalid range", async () => {
    vi.mocked(api.get).mockImplementation((path: string) =>
      path.startsWith("/terminals") ? (Promise.resolve([]) as never) : (Promise.reject(new Error("Zeitraum ungültig")) as never),
    );
    render(<ReportOverview />);
    expect(await screen.findByText("Zeitraum ungültig")).toBeInTheDocument();
  });
});

describe("TerminalConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path === "/terminals") return Promise.resolve([{ id: "t1", name: "Bar", groupIds: [], printPickupReceipts: true }]) as never;
      if (path === "/terminals/t1/key") return Promise.resolve({ key: "oldkey-123" }) as never;
      return Promise.resolve([]) as never;
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("terminal config shows generated key", async () => {
    const confirm = vi.fn().mockReturnValue(true);
    vi.stubGlobal("confirm", confirm);
    vi.mocked(api.post).mockResolvedValueOnce({ key: "newkey-456" });
    render(<TerminalConfig />);
    fireEvent.click(await screen.findByRole("button", { name: "Neuen Schlüssel erzeugen" }));
    expect(confirm).toHaveBeenCalledWith(
      "Der alte Schlüssel wird ungültig. Das Terminal muss neu eingerichtet werden. Fortfahren?",
    );
    expect(await screen.findByText("newkey-456")).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith("/terminals/t1/key");
  });

  it("does not generate a key when the confirmation is declined", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(false));
    render(<TerminalConfig />);
    fireEvent.click(await screen.findByRole("button", { name: "Neuen Schlüssel erzeugen" }));
    expect(api.post).not.toHaveBeenCalled();
  });

  it("shows an error when generating the key fails", async () => {
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    vi.mocked(api.post).mockRejectedValueOnce(new Error("Terminal nicht gefunden"));
    render(<TerminalConfig />);
    fireEvent.click(await screen.findByRole("button", { name: "Neuen Schlüssel erzeugen" }));
    expect(await screen.findByText("Terminal nicht gefunden")).toBeInTheDocument();
  });

  it("shows an error when loading the key fails", async () => {
    vi.mocked(api.get).mockImplementation((path: string) =>
      path === "/terminals"
        ? (Promise.resolve([{ id: "t1", name: "Bar", groupIds: [], printPickupReceipts: true }]) as never)
        : path === "/terminals/t1/key"
          ? (Promise.reject(new Error("Administratorzugriff erforderlich")) as never)
          : (Promise.resolve([]) as never),
    );
    render(<TerminalConfig />);
    fireEvent.click(await screen.findByRole("button", { name: "Schlüssel anzeigen" }));
    expect(await screen.findByText("Administratorzugriff erforderlich")).toBeInTheDocument();
  });

  it("shows the existing key on demand", async () => {
    render(<TerminalConfig />);
    fireEvent.click(await screen.findByRole("button", { name: "Schlüssel anzeigen" }));
    expect(await screen.findByText("oldkey-123")).toBeInTheDocument();
  });

  it("saves the Abholbons drucken setting when adding a terminal", async () => {
    render(<TerminalConfig />);
    await screen.findByText("Bar");
    fireEvent.change(screen.getByPlaceholderText("Terminalname"), { target: { value: "Kasse" } });
    fireEvent.click(screen.getByLabelText("Abholbons drucken"));
    fireEvent.click(screen.getByRole("button", { name: "Hinzufügen" }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/terminals", { name: "Kasse", groupIds: [], printPickupReceipts: false }),
    );
  });
});

describe("CatalogImportExport", () => {
  afterEach(() => {
    Reflect.deleteProperty(URL, "createObjectURL");
    Reflect.deleteProperty(URL, "revokeObjectURL");
  });

  it("sample CSV uses German sample names", async () => {
    let blob: Blob | undefined;
    Object.assign(URL, {
      createObjectURL: vi.fn((b: Blob) => { blob = b; return "blob:sample"; }),
      revokeObjectURL: vi.fn(),
    });
    render(<CatalogImportExport />);
    fireEvent.click(screen.getByRole("button", { name: "Beispiel-CSV herunterladen" }));
    const csv = await blob!.text();
    expect(csv).toContain("Heißgetränke");
    expect(csv).toContain("Backwaren");
    expect(csv).not.toMatch(/Hot Drinks|Bakery|Cookie/);
  });
});
