export interface Terminal {
  id: string;
  name: string;
  groupIds: string[];
  printerVendorId?: number;
  printerProductId?: number;
}

export interface TerminalRow {
  id: string;
  name: string;
  group_ids: string[];
  printer_vendor_id: number | null;
  printer_product_id: number | null;
  created_at: string;
  updated_at: string;
}
