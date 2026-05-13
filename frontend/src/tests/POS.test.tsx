import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ItemGrid from "../components/ItemGrid";
import OrderPanel from "../components/OrderPanel";

describe("ItemGrid", () => {
  const items = [
    { id: "i1", name: "Espresso", price: 2.5 },
    { id: "i2", name: "Cappuccino", price: 3.2 },
    { id: "i3", name: "Croissant", price: 2.0 },
  ];

  it("renders all item buttons with name and price", () => {
    render(<ItemGrid items={items} onAddItem={vi.fn()} onNewOrder={vi.fn()} hasOrder={false} />);
    expect(screen.getByText("Espresso")).toBeInTheDocument();
    expect(screen.getByText("2.50€")).toBeInTheDocument();
    expect(screen.getByText("Cappuccino")).toBeInTheDocument();
    expect(screen.getByText("3.20€")).toBeInTheDocument();
  });

  it("shows empty state when no items assigned", () => {
    render(<ItemGrid items={[]} onAddItem={vi.fn()} onNewOrder={vi.fn()} hasOrder={true} />);
    expect(screen.getByText("No items assigned to this terminal")).toBeInTheDocument();
  });

  it("disables New Order button when order exists", () => {
    render(<ItemGrid items={items} onAddItem={vi.fn()} onNewOrder={vi.fn()} hasOrder={true} />);
    const btn = screen.getByText("Order in progress");
    expect(btn).toBeDisabled();
  });

  it("calls onNewOrder when button clicked", () => {
    const onNewOrder = vi.fn();
    render(<ItemGrid items={items} onAddItem={vi.fn()} onNewOrder={onNewOrder} hasOrder={false} />);
    fireEvent.click(screen.getByText("New Order"));
    expect(onNewOrder).toHaveBeenCalled();
  });

  it("calls onAddItem when item clicked with active order", () => {
    const onAddItem = vi.fn();
    render(<ItemGrid items={items} onAddItem={onAddItem} onNewOrder={vi.fn()} hasOrder={true} />);
    fireEvent.click(screen.getByText("Espresso"));
    expect(onAddItem).toHaveBeenCalledWith("i1");
  });

  it("disables item buttons when no order", () => {
    render(<ItemGrid items={items} onAddItem={vi.fn()} onNewOrder={vi.fn()} hasOrder={false} />);
    expect(screen.getByText("Espresso").closest("button")).toBeDisabled();
  });
});

describe("OrderPanel", () => {
  const order = {
    id: "12345678-1234-1234-1234-123456789abc",
    status: "open",
    items: [
      { itemId: "i1", name: "Espresso", qty: 2, unitPrice: 2.50, total: 5.0 },
      { itemId: "i2", name: "Cappuccino", qty: 1, unitPrice: 3.20, total: 3.2 },
    ],
  };

  it("shows empty state when no order", () => {
    render(<OrderPanel order={null} onPrintPickup={vi.fn()} onPrintFinal={vi.fn()} onPayAndClose={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/No open order/)).toBeInTheDocument();
  });

  it("shows order ID, items, and total", () => {
    render(<OrderPanel order={order} onPrintPickup={vi.fn()} onPrintFinal={vi.fn()} onPayAndClose={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/Order #12345678/)).toBeInTheDocument();
    expect(screen.getByText("Espresso")).toBeInTheDocument();
    expect(screen.getByText("Cappuccino")).toBeInTheDocument();
    expect(screen.getByText("8.20€")).toBeInTheDocument();
  });

  it("shows quantity and unit price", () => {
    render(<OrderPanel order={order} onPrintPickup={vi.fn()} onPrintFinal={vi.fn()} onPayAndClose={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("2× 2.50€")).toBeInTheDocument();
    expect(screen.getByText("1× 3.20€")).toBeInTheDocument();
  });

  it("Print Pickup button per item", () => {
    const onPrintPickup = vi.fn();
    render(<OrderPanel order={order} onPrintPickup={onPrintPickup} onPrintFinal={vi.fn()} onPayAndClose={vi.fn()} onCancel={vi.fn()} />);
    const buttons = screen.getAllByText("Pickup");
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[0]);
    expect(onPrintPickup).toHaveBeenCalledWith("i1");
  });

  it("Pay & Close and Cancel buttons are present", () => {
    render(<OrderPanel order={order} onPrintPickup={vi.fn()} onPrintFinal={vi.fn()} onPayAndClose={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("Pay & Close")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("disables Pay & Close when no items", () => {
    const empty = { ...order, items: [] };
    render(<OrderPanel order={empty} onPrintPickup={vi.fn()} onPrintFinal={vi.fn()} onPayAndClose={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("Pay & Close")).toBeDisabled();
  });

  it("calls onCancel when Cancel clicked", () => {
    const onCancel = vi.fn();
    render(<OrderPanel order={order} onPrintPickup={vi.fn()} onPrintFinal={vi.fn()} onPayAndClose={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalled();
  });
});
