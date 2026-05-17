export interface ItemGroup {
  id: string;
  name: string;
  vatRate: number;
}

export interface Item {
  id: string;
  name: string;
  groupId: string;
  price: number;
}

export interface ItemGroupRow {
  id: string;
  name: string;
  vat_rate: number;
  created_at: string;
  updated_at: string;
}

export interface ItemRow {
  id: string;
  name: string;
  group_id: string;
  price: number;
  created_at: string;
  updated_at: string;
}
