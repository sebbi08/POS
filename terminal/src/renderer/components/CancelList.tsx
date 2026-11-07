import { useState } from "react";
import type { LocalOrder } from "../domain/orders";
import { euro } from "./format";

interface Props {
  orders: LocalOrder[];
  onCancelOrder: (orderId: string) => void;
  onClose: () => void;
}

/** Closed bookings not yet transferred; cancelling one needs an explicit confirmation. */
function CancelList({ orders, onCancelOrder, onClose }: Props) {
  const [selected, setSelected] = useState<LocalOrder | null>(null);
  const newestFirst = [...orders].reverse();

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
      <div role="dialog" aria-labelledby="cancel-title" className="bg-gray-800 rounded-xl p-6 w-[32rem] max-h-[80vh] flex flex-col shadow-2xl">
        <h2 id="cancel-title" className="text-white text-xl font-bold mb-4">Buchung stornieren</h2>

        {selected ? (
          <div className="space-y-4">
            <p className="text-white text-lg text-center">
              {`Buchung #${selected.id.slice(0, 8)} über ${euro(selected.totalGross)} wirklich stornieren?`}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { onCancelOrder(selected.id); onClose(); }}
                className="bg-red-700 hover:bg-red-600 text-white rounded-lg py-4 font-bold"
              >
                Ja, stornieren
              </button>
              <button
                onClick={() => setSelected(null)}
                className="bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-4 font-semibold"
              >
                Abbrechen
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto space-y-2">
              {newestFirst.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setSelected(o)}
                  className="w-full flex justify-between items-center bg-gray-700 hover:bg-gray-600 text-white rounded-lg px-4 py-3"
                >
                  <span className="font-mono">#{o.id.slice(0, 8)}</span>
                  <span className="text-gray-300 text-sm">
                    {o.closedAt ? new Date(o.closedAt).toLocaleTimeString("de-DE") : ""}
                  </span>
                  <span className="font-bold">{euro(o.totalGross)}</span>
                </button>
              ))}
              {orders.length === 0 && (
                <div className="text-gray-400 text-center py-6">Keine stornierbaren Buchungen</div>
              )}
            </div>
            <p className="text-gray-400 text-sm mt-3">Bereits übertragene Buchungen werden im Admin-Bereich storniert.</p>
            <button
              onClick={onClose}
              className="mt-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-3 font-semibold"
            >
              Schließen
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default CancelList;
