import { registerProjection } from "../../projections/runner";
import { Terminal } from "./terminals.types";
import { items } from "../catalog/catalog.projections";

export const terminals: Map<string, Terminal> = new Map();

export function initTerminalProjections(): void {
  registerProjection("current-terminals", "terminal", (event) => {
    switch (event.type) {
      case "TerminalCreated":
        terminals.set(event.data.id as string, {
          id: event.data.id as string,
          name: event.data.name as string,
          groupIds: (event.data.groupIds as string[]) || [],
          printerVendorId: event.data.printerVendorId as number | undefined,
          printerProductId: event.data.printerProductId as number | undefined,
          archived: false,
        });
        break;
      case "TerminalUpdated": {
        const t = terminals.get(event.data.id as string);
        if (t) {
          t.name = event.data.name as string;
          t.groupIds = (event.data.groupIds as string[]) || [];
          t.printerVendorId = event.data.printerVendorId as number | undefined;
          t.printerProductId = event.data.printerProductId as number | undefined;
        }
        break;
      }
      case "TerminalArchived": {
        const t = terminals.get(event.data.id as string);
        if (t) {
          t.archived = true;
        }
        break;
      }
    }
  });
}

export function getTerminalItems(terminalId: string): { id: string; name: string; price: number }[] {
  const terminal = terminals.get(terminalId);
  if (!terminal) return [];
  const result: { id: string; name: string; price: number }[] = [];
  for (const [id, item] of items) {
    if (!item.archived && terminal.groupIds.includes(item.groupId)) {
      result.push({ id, name: item.name, price: item.price });
    }
  }
  return result;
}
