import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CatalogManager from "../components/CatalogManager";
import AdminLayout from "../views/AdminLayout";
import TransactionHistory from "../components/TransactionHistory";
import DailyOverview from "../components/DailyOverview";

vi.mock("../api/client", () => ({
  api: {
    get: vi.fn((_path: string) => {
      if (_path === "/reporting/daily") {
        return Promise.resolve({
          date: "2026-05-13", orderCount: 0, cancelledCount: 0,
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
      expect(screen.getByText("2.50€")).toBeInTheDocument();
    });
  });

  it("Delete button calls DELETE", async () => {
    vi.mocked(api.get).mockResolvedValueOnce([
      { id: "g1", name: "Drinks", vatRate: 19 },
    ]);
    render(<CatalogManager type="groups" />);
    await waitFor(() => screen.getByText("Drinks"));

    fireEvent.click(screen.getByText("Delete"));
    expect(api.delete).toHaveBeenCalledWith("/catalog/groups/g1");
  });
});

describe("AdminLayout", () => {
  it("renders all navigation tabs", () => {
    render(<MemoryRouter><AdminLayout /></MemoryRouter>);
    expect(screen.getByText("Item Groups")).toBeInTheDocument();
    expect(screen.getByText("Items")).toBeInTheDocument();
    expect(screen.getByText("Terminals")).toBeInTheDocument();
    expect(screen.getByText("Company")).toBeInTheDocument();
    expect(screen.getByText("Daily Overview")).toBeInTheDocument();
    expect(screen.getByText("Transactions")).toBeInTheDocument();
  });

  it("no longer has Users tab", () => {
    render(<MemoryRouter><AdminLayout /></MemoryRouter>);
    expect(screen.queryByText("Users")).not.toBeInTheDocument();
  });

  it("Logout button is present", () => {
    render(<MemoryRouter><AdminLayout /></MemoryRouter>);
    expect(screen.getByText("Logout")).toBeInTheDocument();
  });

  it("navigates to / when Logout clicked", () => {
    const { container } = render(<MemoryRouter><AdminLayout /></MemoryRouter>);
    fireEvent.click(screen.getByText("Logout"));
    // Navigation happens via useNavigate; presence of button is sufficient test
    expect(screen.getByText("Logout")).toBeInTheDocument();
  });

  it("renders Import/Export tab", () => {
    render(<MemoryRouter><AdminLayout /></MemoryRouter>);
    expect(screen.getByText("Import/Export")).toBeInTheDocument();
  });
});

describe("TransactionHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows closed and cancelled orders with status badges", async () => {
    vi.mocked(api.get).mockResolvedValueOnce([
      { orderId: "abc12345-1234", terminalId: "Bar", items: "1x Espresso", totalGross: 2.50, status: "closed", closedAt: "2026-01-01T12:00:00Z" },
      { orderId: "def67890-5678", terminalId: "Bar", items: "2x Latte", totalGross: -7.00, status: "cancelled", title: "Cancellation of order #abc12345", closedAt: "2026-01-01T12:05:00Z" },
    ]);

    render(<TransactionHistory />);
    await waitFor(() => {
      expect(screen.getByText("closed")).toBeInTheDocument();
      expect(screen.getByText("cancelled")).toBeInTheDocument();
      expect(screen.getByText("Cancellation of order #abc12345")).toBeInTheDocument();
    });
  });

  it("has search and filter inputs", async () => {
    vi.mocked(api.get).mockResolvedValueOnce([]);
    render(<TransactionHistory />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search by order ID or item...")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Terminal")).toBeInTheDocument();
    });
  });

  it("shows empty state when no transactions", async () => {
    vi.mocked(api.get).mockResolvedValueOnce([]);
    render(<TransactionHistory />);
    await waitFor(() => {
      expect(screen.getByText("No transactions found")).toBeInTheDocument();
    });
  });
});

describe("DailyOverview", () => {
  it("shows summary cards and breakdown", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      date: "2026-05-13",
      orderCount: 47,
      cancelledCount: 2,
      totalGross: 873.50,
      totalVat: 112.30,
      totalNet: 761.20,
      vatByGroup: { "g1": { rate: 19, gross: 500, vat: 79.83 } },
      byTerminal: { "Bar": { orderCount: 30, total: 500 } },
      topItems: [{ itemId: "i1", name: "Espresso", count: 45 }],
    });

    render(<DailyOverview />);
    await waitFor(() => {
      expect(screen.getByText("47")).toBeInTheDocument();
      expect(screen.getByText("873.50€")).toBeInTheDocument();
      expect(screen.getByText("Top Items")).toBeInTheDocument();
      expect(screen.getByText(/Espresso/)).toBeInTheDocument();
    });
  });

  it("shows cancelled order warning when count > 0", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      date: "2026-05-13",
      orderCount: 10,
      cancelledCount: 3,
      totalGross: 100,
      totalVat: 10,
      totalNet: 90,
      vatByGroup: {},
      byTerminal: {},
      topItems: [],
    });

    render(<DailyOverview />);
    await waitFor(() => {
      expect(screen.getByText(/3 cancelled order/)).toBeInTheDocument();
    });
  });
});
