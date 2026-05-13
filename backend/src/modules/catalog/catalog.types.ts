export interface ItemGroup {
  id: string;
  name: string;
  vatRate: number;
  archived: boolean;
}

export interface Item {
  id: string;
  name: string;
  groupId: string;
  price: number;
  archived: boolean;
}

export interface ItemGroupCreatedEvent {
  id: string;
  name: string;
  vatRate: number;
}

export interface ItemGroupUpdatedEvent {
  id: string;
  name: string;
  vatRate: number;
}

export interface ItemGroupArchivedEvent {
  id: string;
}

export interface ItemCreatedEvent {
  id: string;
  name: string;
  groupId: string;
  price: number;
}

export interface ItemUpdatedEvent {
  id: string;
  name: string;
  groupId: string;
  price: number;
}

export interface ItemArchivedEvent {
  id: string;
}
