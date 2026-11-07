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
          <h2 className="text-gray-400 text-sm font-semibold uppercase tracking-wide mb-2">{group.name}</h2>
          <div className="grid grid-cols-3 gap-2">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => onAddItem(item.id)}
                disabled={disabled}
                className="bg-gray-800 hover:bg-gray-700 active:bg-gray-600 disabled:opacity-60 rounded-lg p-3 flex flex-col items-center justify-center text-center min-h-[96px] transition-colors"
              >
                <span className="text-white font-semibold text-lg">{item.name}</span>
                <span className="text-gray-400 text-sm mt-1">{euro(item.price)}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
      {sections.length === 0 && (
        <div className="text-gray-500 text-center py-8">Diesem Terminal sind keine Artikel zugeordnet</div>
      )}
    </div>
  );
}

export default ItemGrid;
