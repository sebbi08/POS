import { v4 as uuid } from "uuid";
import { appendEvent } from "../../eventstore/client";
import {
  TerminalCreatedEvent,
  TerminalUpdatedEvent,
  TerminalArchivedEvent,
} from "./terminals.types";

const STREAM = (id: string) => `terminal-${id}`;

export async function createTerminal(
  name: string,
  groupIds: string[],
  printerVendorId?: number,
  printerProductId?: number
): Promise<string> {
  const id = uuid();
  const data: TerminalCreatedEvent = {
    id,
    name,
    groupIds,
    printerVendorId,
    printerProductId,
  };
  await appendEvent(STREAM(id), "TerminalCreated", data as unknown as Record<string, unknown>);
  return id;
}

export async function updateTerminal(
  id: string,
  name: string,
  groupIds: string[],
  printerVendorId?: number,
  printerProductId?: number
): Promise<void> {
  const data: TerminalUpdatedEvent = {
    id,
    name,
    groupIds,
    printerVendorId,
    printerProductId,
  };
  await appendEvent(STREAM(id), "TerminalUpdated", data as unknown as Record<string, unknown>);
}

export async function archiveTerminal(id: string): Promise<void> {
  const data: TerminalArchivedEvent = { id };
  await appendEvent(STREAM(id), "TerminalArchived", data as unknown as Record<string, unknown>);
}
