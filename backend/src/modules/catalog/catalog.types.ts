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

export interface ExportRow {
  id: string;
  name: string;
  group_name: string;
  group_vat_rate: number;
  price: number;
}

export interface ImportRow {
  id: string;
  name: string;
  groupName: string;
  groupVatRate: string;
  price: string;
}

export interface ImportPreview {
  groupsToCreate: { name: string; vatRate: number }[];
  itemsToCreate: { id: string; name: string; groupName: string; price: number }[];
  itemsToUpdate: { id: string; name: string; groupName: string; price: number; oldName: string; oldPrice: number; oldGroupName: string }[];
  errors: string[];
}

export interface ImportResult extends ImportPreview {
  groupsCreated: number;
  itemsCreated: number;
  itemsUpdated: number;
}
