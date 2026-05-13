import { registerProjection } from "../../projections/runner";
import { ItemGroup, Item } from "./catalog.types";

export const groups: Map<string, ItemGroup> = new Map();
export const items: Map<string, Item> = new Map();

export function initCatalogProjections(): void {
  registerProjection("current-catalog", "catalog", (event) => {
    switch (event.type) {
      case "ItemGroupCreated":
        groups.set(event.data.id as string, {
          id: event.data.id as string,
          name: event.data.name as string,
          vatRate: event.data.vatRate as number,
          archived: false,
        });
        break;
      case "ItemGroupUpdated": {
        const g = groups.get(event.data.id as string);
        if (g) {
          g.name = event.data.name as string;
          g.vatRate = event.data.vatRate as number;
        }
        break;
      }
      case "ItemGroupArchived": {
        const g = groups.get(event.data.id as string);
        if (g) {
          g.archived = true;
        }
        break;
      }
      case "ItemCreated":
        items.set(event.data.id as string, {
          id: event.data.id as string,
          name: event.data.name as string,
          groupId: event.data.groupId as string,
          price: event.data.price as number,
          archived: false,
        });
        break;
      case "ItemUpdated": {
        const item = items.get(event.data.id as string);
        if (item) {
          item.name = event.data.name as string;
          item.groupId = event.data.groupId as string;
          item.price = event.data.price as number;
        }
        break;
      }
      case "ItemArchived": {
        const item = items.get(event.data.id as string);
        if (item) {
          item.archived = true;
        }
        break;
      }
    }
  });
}
