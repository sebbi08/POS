// Sync contract between terminal and server.
// MUST stay identical to backend/src/modules/sync/sync.types.ts — change both together.
export type BookingEventType = "OrderOpened" | "ItemAdded" | "ItemRemoved"
  | "FinalReceiptPrinted" | "PickupReceiptPrinted" | "OrderClosed" | "OrderCancellationCreated";
export interface BookingEvent { type: BookingEventType; data: Record<string, unknown>; occurredAt: string }
export interface BookingUpload { orderId: string; events: BookingEvent[] }
export interface UploadRequest { orders: BookingUpload[] }
export interface UploadResponse { serverTime: string; accepted: string[]; rejected: { orderId: string; error: string }[] }
export interface CatalogSnapshot {
  serverTime: string;
  terminal: { id: string; name: string; printPickupReceipts: boolean };
  company: { name: string; address: string; city: string; vatId: string };
  groups: { id: string; name: string; vatRate: number }[];
  items: { id: string; name: string; groupId: string; price: number }[];
}
