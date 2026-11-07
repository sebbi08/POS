import { useState } from "react";
import { round2 } from "../domain/money";
import { euro } from "./format";

interface Props {
  total: number;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Accepts "10", "10,50" or "10.50"; null if it is not a number. */
function parseAmount(input: string): number | null {
  const s = input.trim().replace(",", ".");
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(s)) return null;
  return Number(s);
}

/** Change calculator shown before closing the order. */
function CheckoutDialog({ total, onConfirm, onCancel }: Props) {
  const [given, setGiven] = useState("");
  const amount = parseAmount(given);
  const change = amount === null ? null : round2(amount - total);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
      <div role="dialog" aria-labelledby="checkout-title" className="bg-gray-800 rounded-xl p-6 w-96 shadow-2xl">
        <h2 id="checkout-title" className="text-white text-xl font-bold mb-4">Bezahlen</h2>

        <div className="space-y-4">
          <div className="flex justify-between text-white text-2xl font-bold">
            <span>Summe</span>
            <span>{euro(total)}</span>
          </div>
          <div>
            <label htmlFor="checkout-given" className="text-gray-400 text-sm block mb-1">Gegeben</label>
            <input
              id="checkout-given"
              inputMode="decimal"
              autoFocus
              value={given}
              onChange={(e) => setGiven(e.target.value)}
              className="w-full bg-gray-700 text-white text-2xl rounded-lg px-3 py-3 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex justify-between text-2xl font-bold">
            <span className="text-white">Rückgeld</span>
            {change === null ? (
              <span className="text-gray-500">–</span>
            ) : change < 0 ? (
              <span className="text-red-400 text-lg">Betrag reicht nicht</span>
            ) : (
              <span className="text-green-400">{euro(change)}</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mt-6">
          <button
            onClick={onConfirm}
            className="bg-green-600 hover:bg-green-500 text-white rounded-lg py-4 font-bold"
          >
            Abschließen & Drucken
          </button>
          <button
            onClick={onCancel}
            className="bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-4 font-semibold"
          >
            Abbrechen
          </button>
        </div>
      </div>
    </div>
  );
}

export default CheckoutDialog;
