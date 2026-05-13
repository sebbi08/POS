export interface Terminal {
  id: string;
  name: string;
  groupIds: string[];
  printerVendorId?: number;
  printerProductId?: number;
  archived: boolean;
}

export interface TerminalCreatedEvent {
  id: string;
  name: string;
  groupIds: string[];
  printerVendorId?: number;
  printerProductId?: number;
}

export interface TerminalUpdatedEvent {
  id: string;
  name: string;
  groupIds: string[];
  printerVendorId?: number;
  printerProductId?: number;
}

export interface TerminalArchivedEvent {
  id: string;
}
