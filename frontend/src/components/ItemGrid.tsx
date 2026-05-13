interface TerminalItem {
  id: string;
  name: string;
  price: number;
}

interface Props {
  items: TerminalItem[];
  onAddItem: (itemId: string) => void;
  onNewOrder: () => void;
  hasOrder: boolean;
}

function ItemGrid({ items, onAddItem, onNewOrder, hasOrder }: Props) {
  return (
    <div className="h-full flex flex-col">
      <div className="mb-3">
        <button
          onClick={onNewOrder}
          className={`w-full rounded-lg py-3 text-lg font-bold transition-colors ${
            hasOrder
              ? "bg-gray-700 text-gray-500 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-500 text-white"
          }`}
          disabled={hasOrder}
        >
          {hasOrder ? "Order in progress" : "New Order"}
        </button>
      </div>
      <div className="flex-1 grid grid-cols-3 gap-2 overflow-y-auto">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => hasOrder && onAddItem(item.id)}
            disabled={!hasOrder}
            className="bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg p-3 flex flex-col items-center justify-center text-center min-h-[80px] transition-colors"
          >
            <span className="text-white font-semibold text-sm">{item.name}</span>
            <span className="text-gray-400 text-xs mt-1">
              {item.price.toFixed(2)}€
            </span>
          </button>
        ))}
        {items.length === 0 && (
          <div className="col-span-3 text-gray-500 text-center py-8">
            No items assigned to this terminal
          </div>
        )}
      </div>
    </div>
  );
}

export default ItemGrid;
