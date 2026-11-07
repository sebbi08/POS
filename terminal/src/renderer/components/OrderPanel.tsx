import { useState } from "react";
import type { LocalOrder } from "../domain/orders";
import { euro } from "./format";

interface Props {
  order: LocalOrder | undefined;
  disabled: boolean;
  onChangeQty: (itemId: string, delta: 1 | -1) => void;
  onRemoveLine: (itemId: string) => void;
  onPay: () => void;
  onDiscard: () => void;
}

function OrderPanel({ order, disabled, onChangeQty, onRemoveLine, onPay, onDiscard }: Props) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  if (!order) {
    return (
      <section aria-label="Bestellung" className="h-full bg-gray-800 rounded-xl p-4 flex items-center justify-center text-gray-500 text-center">
        Keine offene Bestellung. Artikel antippen zum Starten.
      </section>
    );
  }

  return (
    <section aria-label="Bestellung" className="h-full bg-gray-800 rounded-xl p-4 flex flex-col">
      <h2 className="text-white font-bold text-lg mb-3">Bestellung #{order.id.slice(0, 8)}</h2>

      <div className="flex-1 overflow-y-auto mb-3">
        {order.lines.map((line) => (
          <div key={line.itemId} className="flex items-center justify-between bg-gray-700 rounded-lg p-3 mb-2">
            <div className="flex-1 min-w-0">
              <div className="text-white font-medium truncate">{line.name}</div>
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => onChangeQty(line.itemId, -1)}
                  disabled={disabled}
                  className="bg-gray-600 hover:bg-gray-500 disabled:opacity-60 text-white text-lg w-10 h-10 rounded flex items-center justify-center transition-colors"
                  aria-label="Menge verringern"
                >
                  −
                </button>
                <span className="text-white font-bold w-8 text-center">{line.qty}</span>
                <button
                  onClick={() => onChangeQty(line.itemId, 1)}
                  disabled={disabled}
                  className="bg-gray-600 hover:bg-gray-500 disabled:opacity-60 text-white text-lg w-10 h-10 rounded flex items-center justify-center transition-colors"
                  aria-label="Menge erhöhen"
                >
                  +
                </button>
                <span className="text-gray-400 text-sm ml-1">× {euro(line.unitPrice)}</span>
              </div>
            </div>
            <div className="text-white font-bold mr-2">{euro(line.total)}</div>
            <button
              onClick={() => onRemoveLine(line.itemId)}
              disabled={disabled}
              className="text-red-400 hover:text-red-300 disabled:opacity-60 text-xl w-10 h-10 rounded flex items-center justify-center hover:bg-gray-600 transition-colors"
              aria-label="Artikel entfernen"
            >
              ×
            </button>
          </div>
        ))}
        {order.lines.length === 0 && (
          <div className="text-gray-500 text-center py-4">Artikel links antippen</div>
        )}
      </div>

      <div className="border-t border-gray-700 pt-3 mb-3">
        <div className="flex justify-between text-white font-bold text-xl">
          <span>Summe</span>
          <span>{euro(order.totalGross)}</span>
        </div>
      </div>

      {confirmDiscard ? (
        <div className="bg-gray-900 rounded-lg p-3">
          <p className="text-white text-center font-semibold mb-3">Bestellung verwerfen?</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { setConfirmDiscard(false); onDiscard(); }}
              disabled={disabled}
              className="bg-red-700 hover:bg-red-600 disabled:opacity-60 text-white rounded-lg py-3 font-semibold"
            >
              Ja, verwerfen
            </button>
            <button
              onClick={() => setConfirmDiscard(false)}
              className="bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-3 font-semibold"
            >
              Abbrechen
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => setConfirmDiscard(true)}
            disabled={disabled}
            className="bg-red-900 hover:bg-red-800 disabled:opacity-60 text-red-300 rounded-lg py-4 font-semibold"
          >
            Verwerfen
          </button>
          <button
            onClick={onPay}
            disabled={disabled || order.lines.length === 0}
            className="col-span-2 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white rounded-lg py-4 text-lg font-bold"
          >
            Bezahlen & Drucken
          </button>
        </div>
      )}
    </section>
  );
}

export default OrderPanel;
