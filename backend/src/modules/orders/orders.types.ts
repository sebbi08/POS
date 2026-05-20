export type OrderStatus = "open" | "closed";

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
  status: OrderStatus;
  items: OrderItem[];
  pickupSeq: number;
  totalGross: number;
  totalVat: Record<number, number>;
  totalNet: number;
  createdAt: Date;
  closedAt?: Date;
  title?: string;
  cancelsOrderId?: string;
  cancelledByOrderId?: string;
}

export interface OrderOpenedEvent {
  id: string;
  terminalId: string;
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

export interface OrderClosedEvent {
  orderId: string;
  totalGross: number;
  totalVat: Record<number, number>;
  totalNet: number;
  cancelled?: boolean;
}

export interface OrderCancellationCreatedEvent {
  id: string;
  terminalId: string;
  title: string;
  cancelsOrderId: string;
  items: OrderItem[];
  totalGross: number;
  totalVat: Record<number, number>;
  totalNet: number;
  createdAt: string;
  closedAt: string;
}
