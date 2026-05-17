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
    render(<ItemGrid items={items} onAddItem={vi.fn()} />);
    expect(screen.getByText("Espresso")).toBeInTheDocument();
    expect(screen.getByText("2.50€")).toBeInTheDocument();
    expect(screen.getByText("Cappuccino")).toBeInTheDocument();
    expect(screen.getByText("3.20€")).toBeInTheDocument();
  });

  it("shows empty state when no items assigned", () => {
    render(<ItemGrid items={[]} onAddItem={vi.fn()} />);
    expect(screen.getByText("No items assigned to this terminal")).toBeInTheDocument();
  });

  it("calls onAddItem when item clicked", () => {
    const onAddItem = vi.fn();
    render(<ItemGrid items={items} onAddItem={onAddItem} />);
    fireEvent.click(screen.getByText("Espresso"));
    expect(onAddItem).toHaveBeenCalledWith("i1");
  });

  it("items are always enabled (no order needed)", () => {
    render(<ItemGrid items={items} onAddItem={vi.fn()} />);
    expect(screen.getByText("Espresso").closest("button")).not.toBeDisabled();
  });
});

describe("OrderPanel", () => {
  const noop = vi.fn();
  const emptyProps = {
    onPrint: noop,
    onPayAndClose: noop,
    onCancel: noop,
    onIncreaseQty: noop,
    onDecreaseQty: noop,
    onRemoveItem: noop,
  };

  const order = {
    id: "12345678-1234-1234-1234-123456789abc",
    status: "open",
    items: [
      { itemId: "i1", name: "Espresso", qty: 2, unitPrice: 2.50, total: 5.0 },
      { itemId: "i2", name: "Cappuccino", qty: 1, unitPrice: 3.20, total: 3.2 },
    ],
  };

  it("shows empty state when no order", () => {
    render(<OrderPanel order={null} {...emptyProps} />);
    expect(screen.getByText(/No open order/)).toBeInTheDocument();
  });

  it("shows order ID, items, and total", () => {
    render(<OrderPanel order={order} {...emptyProps} />);
    expect(screen.getByText(/Order #12345678/)).toBeInTheDocument();
    expect(screen.getByText("Espresso")).toBeInTheDocument();
    expect(screen.getByText("Cappuccino")).toBeInTheDocument();
    expect(screen.getByText("8.20€")).toBeInTheDocument();
  });

  it("shows quantity and unit price", () => {
    render(<OrderPanel order={order} {...emptyProps} />);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("calls onIncreaseQty when + button clicked", () => {
    const onIncreaseQty = vi.fn();
    render(<OrderPanel order={order} {...emptyProps} onIncreaseQty={onIncreaseQty} />);
    const plusButtons = screen.getAllByLabelText("Increase quantity");
    fireEvent.click(plusButtons[0]);
    expect(onIncreaseQty).toHaveBeenCalledWith("i1");
  });

  it("calls onDecreaseQty when − button clicked on item with qty > 1", () => {
    const onDecreaseQty = vi.fn();
    render(<OrderPanel order={order} {...emptyProps} onDecreaseQty={onDecreaseQty} />);
    const minusButtons = screen.getAllByLabelText("Decrease quantity");
    fireEvent.click(minusButtons[0]); // Espresso has qty=2
    expect(onDecreaseQty).toHaveBeenCalledWith("i1");
  });

  it("calls onRemoveItem when − button clicked on item with qty = 1", () => {
    const onRemoveItem = vi.fn();
    render(<OrderPanel order={order} {...emptyProps} onRemoveItem={onRemoveItem} />);
    const minusButtons = screen.getAllByLabelText("Decrease quantity");
    fireEvent.click(minusButtons[1]); // Cappuccino has qty=1
    expect(onRemoveItem).toHaveBeenCalledWith("i2");
  });

  it("calls onRemoveItem when × button clicked", () => {
    const onRemoveItem = vi.fn();
    render(<OrderPanel order={order} {...emptyProps} onRemoveItem={onRemoveItem} />);
    const removeButtons = screen.getAllByLabelText("Remove item");
    fireEvent.click(removeButtons[0]);
    expect(onRemoveItem).toHaveBeenCalledWith("i1");
  });

  it("Print button triggers onPrint", () => {
    const onPrint = vi.fn();
    render(<OrderPanel order={order} {...emptyProps} onPrint={onPrint} />);
    fireEvent.click(screen.getByText("Print"));
    expect(onPrint).toHaveBeenCalled();
  });

  it("Pay & Close and Print buttons are present", () => {
    render(<OrderPanel order={order} {...emptyProps} />);
    expect(screen.getByText("Print")).toBeInTheDocument();
    expect(screen.getByText("Pay & Close")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("disables Pay & Close when no items", () => {
    const empty = { ...order, items: [] };
    render(<OrderPanel order={empty} {...emptyProps} />);
    expect(screen.getByText("Pay & Close")).toBeDisabled();
  });

  it("calls onCancel when Cancel clicked", () => {
    const onCancel = vi.fn();
    render(<OrderPanel order={order} {...emptyProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalled();
  });
});
