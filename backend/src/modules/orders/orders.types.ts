export type OrderStatus = "open" | "paid" | "closed" | "cancelled";

export interface OrderItem {
  itemId: string;
  name: string;
  qty: number;
  unitPrice: number;
  vatRate: number;
  vatAmount: number;
  total: number;
}

export interface Order {
  id: string;
  terminalId: string;
  userId: string;
  status: OrderStatus;
  items: OrderItem[];
  pickupSeq: number;
  totalGross: number;
  totalVat: Record<number, number>;
  totalNet: number;
  createdAt: Date;
  closedAt?: Date;
  cancelledReason?: string;
}

export interface OrderOpenedEvent {
  id: string;
  terminalId: string;
  userId: string;
}

export interface ItemAddedEvent {
  orderId: string;
  itemId: string;
  name: string;
  qty: number;
  unitPrice: number;
  vatRate: number;
  vatAmount: number;
  total: number;
}

export interface ItemRemovedEvent {
  orderId: string;
  itemId: string;
}

export interface PickupReceiptPrintedEvent {
  orderId: string;
  itemId: string;
}

export interface FinalReceiptPrintedEvent {
  orderId: string;
}

export interface OrderPaidEvent {
  orderId: string;
  totalGross: number;
  totalVat: Record<number, number>;
  totalNet: number;
}

export interface OrderClosedEvent {
  orderId: string;
}

export interface OrderCancelledEvent {
  orderId: string;
  reason: string;
  userId: string;
}
