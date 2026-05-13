import { v4 as uuid } from "uuid";
import { appendEvent } from "../../eventstore/client";
import {
  ItemGroupCreatedEvent,
  ItemGroupUpdatedEvent,
  ItemGroupArchivedEvent,
  ItemCreatedEvent,
  ItemUpdatedEvent,
  ItemArchivedEvent,
} from "./catalog.types";

const GROUP_STREAM = (id: string) => `catalog-${id}`;
const ITEM_STREAM = (id: string) => `catalog-${id}`;

export async function createItemGroup(
  name: string,
  vatRate: number
): Promise<string> {
  const id = uuid();
  const data: ItemGroupCreatedEvent = { id, name, vatRate };
  await appendEvent(GROUP_STREAM(id), "ItemGroupCreated", data as unknown as Record<string, unknown>);
  return id;
}

export async function updateItemGroup(
  id: string,
  name: string,
  vatRate: number
): Promise<void> {
  const data: ItemGroupUpdatedEvent = { id, name, vatRate };
  await appendEvent(GROUP_STREAM(id), "ItemGroupUpdated", data as unknown as Record<string, unknown>);
}

export async function archiveItemGroup(id: string): Promise<void> {
  const data: ItemGroupArchivedEvent = { id };
  await appendEvent(GROUP_STREAM(id), "ItemGroupArchived", data as unknown as Record<string, unknown>);
}

export async function createItem(
  name: string,
  groupId: string,
  price: number
): Promise<string> {
  const id = uuid();
  const data: ItemCreatedEvent = { id, name, groupId, price };
  await appendEvent(ITEM_STREAM(id), "ItemCreated", data as unknown as Record<string, unknown>);
  return id;
}

export async function updateItem(
  id: string,
  name: string,
  groupId: string,
  price: number
): Promise<void> {
  const data: ItemUpdatedEvent = { id, name, groupId, price };
  await appendEvent(ITEM_STREAM(id), "ItemUpdated", data as unknown as Record<string, unknown>);
}

export async function archiveItem(id: string): Promise<void> {
  const data: ItemArchivedEvent = { id };
  await appendEvent(ITEM_STREAM(id), "ItemArchived", data as unknown as Record<string, unknown>);
}
