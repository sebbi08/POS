export interface ReceiptPrintNotification {
  orderId: string;
  type: "pickup" | "final";
  itemId?: string;
  terminalId: string;
}
