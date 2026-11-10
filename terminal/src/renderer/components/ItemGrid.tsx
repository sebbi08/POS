import { Button } from "@/components/ui/button";
import type { CatalogSnapshot } from "../../shared/contract";
import { euro } from "./format";

interface Props {
  catalog: CatalogSnapshot;
  disabled: boolean;
  onAddItem: (itemId: string) => void;
}

/** Items grouped by Warengruppe, as large touch buttons. */
function ItemGrid({ catalog, disabled, onAddItem }: Props) {
  const sections = catalog.groups
    .map((g) => ({ group: g, items: catalog.items.filter((i) => i.groupId === g.id) }))
    .filter((s) => s.items.length > 0);

  return (
    <div className="h-full overflow-y-auto space-y-4 pr-1">
      {sections.map(({ group, items }) => (
        <section key={group.id}>
          <h2 className="text-muted-foreground text-sm font-semibold uppercase tracking-wide mb-2">{group.name}</h2>
          <div className="grid grid-cols-3 gap-2">
            {items.map((item) => (
              <Button
                key={item.id}
                variant="secondary"
                size="touch"
                onClick={() => onAddItem(item.id)}
                disabled={disabled}
                // whitespace-normal: long names wrap inside the tile instead of overflowing it
                className="min-h-24 flex-col gap-1 p-3 whitespace-normal text-center active:brightness-125"
              >
                <span className="font-semibold text-lg">{item.name}</span>
                <span className="text-muted-foreground text-sm">{euro(item.price)}</span>
              </Button>
            ))}
          </div>
        </section>
      ))}
      {sections.length === 0 && (
        <div className="text-muted-foreground text-center py-8">Diesem Terminal sind keine Artikel zugeordnet</div>
      )}
    </div>
  );
}

export default ItemGrid;
