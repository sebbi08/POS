interface OrderItem {
  itemId: string;
  name: string;
  qty: number;
  unitPrice: number;
  total: number;
}

interface Order {
  id: string;
  status: string;
  items: OrderItem[];
}

interface Props {
  order: Order | null;
  onPrint: () => void;
  onPayAndClose: () => void;
  onCancel: () => void;
  onIncreaseQty: (itemId: string) => void;
  onDecreaseQty: (itemId: string) => void;
  onRemoveItem: (itemId: string) => void;
}

function OrderPanel({
  order,
  onPrint,
  onPayAndClose,
  onCancel,
  onIncreaseQty,
  onDecreaseQty,
  onRemoveItem,
}: Props) {
  if (!order) {
    return (
      <div className="h-full bg-gray-800 rounded-xl p-4 flex items-center justify-center text-gray-500">
        No open order. Tap an item to start.
      </div>
    );
  }

  const total = order.items.reduce((sum, i) => sum + i.total, 0);

  return (
    <div className="h-full bg-gray-800 rounded-xl p-4 flex flex-col">
      <h2 className="text-white font-bold text-lg mb-3">
        Order #{order.id.slice(0, 8)}
      </h2>

      <div className="flex-1 overflow-y-auto mb-3">
        {order.items.map((item) => (
          <div
            key={item.itemId}
            className="flex items-center justify-between bg-gray-700 rounded-lg p-3 mb-2"
          >
            <div className="flex-1 min-w-0">
              <div className="text-white font-medium truncate">{item.name}</div>
              <div className="flex items-center gap-1 mt-1">
                <button
                  onClick={() => item.qty <= 1 ? onRemoveItem(item.itemId) : onDecreaseQty(item.itemId)}
                  className="bg-gray-600 hover:bg-gray-500 text-white text-xs w-6 h-6 rounded flex items-center justify-center transition-colors"
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <span className="text-white text-sm font-bold w-6 text-center">{item.qty}</span>
                <button
                  onClick={() => onIncreaseQty(item.itemId)}
                  className="bg-gray-600 hover:bg-gray-500 text-white text-xs w-6 h-6 rounded flex items-center justify-center transition-colors"
                  aria-label="Increase quantity"
                >
                  +
                </button>
                <span className="text-gray-400 text-xs ml-1">
                  × {item.unitPrice.toFixed(2)}€
                </span>
              </div>
            </div>
            <div className="text-white font-bold mr-2">
              {item.total.toFixed(2)}€
            </div>
            <button
              onClick={() => onRemoveItem(item.itemId)}
              className="text-red-400 hover:text-red-300 text-xs w-6 h-6 rounded flex items-center justify-center hover:bg-gray-600 transition-colors"
              aria-label="Remove item"
            >
              ×
            </button>
          </div>
        ))}
        {order.items.length === 0 && (
          <div className="text-gray-500 text-center py-4">
            Add items from the grid
          </div>
        )}
      </div>

      <div className="border-t border-gray-700 pt-3 mb-3">
        <div className="flex justify-between text-white font-bold text-lg">
          <span>Total</span>
          <span>{total.toFixed(2)}€</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onPrint}
          disabled={order.items.length === 0}
          className="bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white rounded-lg py-3 text-sm font-semibold"
        >
          Print
        </button>
        <button
          onClick={onCancel}
          className="bg-red-900 hover:bg-red-800 text-red-300 rounded-lg py-3 text-sm font-semibold"
        >
          Cancel
        </button>
        <button
          onClick={onPayAndClose}
          disabled={order.items.length === 0}
          className="col-span-2 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white rounded-lg py-3 text-lg font-bold"
        >
          Pay & Close
        </button>
      </div>
    </div>
  );
}

export default OrderPanel;
