export interface DailyReport {
  date: string;
  orderCount: number;
  cancelledCount: number;
  totalGross: number;
  totalVat: number;
  totalNet: number;
  vatByGroup: Record<string, { rate: number; gross: number; vat: number }>;
  byTerminal: Record<string, { orderCount: number; total: number }>;
  topItems: { itemId: string; name: string; count: number }[];
}

export interface TransactionRecord {
  orderId: string;
  terminalId: string;
  items: string;
  itemCount: number;
  totalGross: number;
  totalVat: number;
  status: string;
  title?: string;
  cancelsOrderId?: string;
  closedAt: string;
}
