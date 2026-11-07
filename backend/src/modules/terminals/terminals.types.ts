export interface Terminal {
  id: string;
  name: string;
  groupIds: string[];
  printPickupReceipts: boolean;
}

export interface TerminalRow {
  id: string;
  name: string;
  group_ids: string[];
  printer_vendor_id: number | null;
  printer_product_id: number | null;
  print_pickup_receipts: boolean;
  api_key: string | null;
  created_at: string;
  updated_at: string;
}
