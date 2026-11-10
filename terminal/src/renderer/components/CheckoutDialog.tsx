import { useCallback, useEffect, useRef, useState } from "react";
import { round2 } from "../domain/money";
import { applyKey, type KeypadKey } from "../domain/keypad-entry";
import { euro } from "./format";
import Keypad from "./Keypad";

interface Props {
  total: number;
  onConfirm: () => void;
  onCancel: () => void;
}

const NOTES = [5, 10, 20, 50];

const QUICK = "h-12 rounded-lg text-white text-lg font-semibold select-none touch-manipulation";
const EXACT_KEY = `${QUICK} col-span-4 bg-blue-600 hover:bg-blue-500 active:bg-blue-400`;
const NOTE_KEY = `${QUICK} bg-blue-800 hover:bg-blue-700 active:bg-blue-600`;

/** Accepts "10", "10,50" or "10.50"; null if it is not a number. */
function parseAmount(input: string): number | null {
  const s = input.trim().replace(",", ".");
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(s)) return null;
  return Number(s);
}

interface Entry {
  given: string;
  /** Set by a quick amount: the next digit or comma starts a new amount instead of extending it. */
  replaceNext: boolean;
}

/** Change calculator shown before closing the order. */
function CheckoutDialog({ total, onConfirm, onCancel }: Props) {
  const [{ given }, setEntry] = useState<Entry>({ given: "", replaceNext: false });
  const amount = parseAmount(given);
  const change = amount === null ? null : round2(amount - total);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Take the focus so no field behind the dialog receives hardware keystrokes.
  useEffect(() => dialogRef.current?.focus(), []);

  const onKey = useCallback((key: KeypadKey) => {
    setEntry((e) => {
      const base = e.replaceNext && key !== "back" ? "" : e.given;
      return { given: applyKey(base, key, "amount"), replaceNext: false };
    });
  }, []);

  const setQuick = (value: string) => setEntry({ given: value, replaceNext: true });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-labelledby="checkout-title"
        className="bg-gray-800 rounded-xl p-6 w-96 max-h-screen overflow-y-auto shadow-2xl outline-none"
      >
        <h2 id="checkout-title" className="text-white text-xl font-bold mb-4">Bezahlen</h2>

        <div className="space-y-3">
          <div className="flex justify-between text-white text-2xl font-bold">
            <span>Summe</span>
            <span>{euro(total)}</span>
          </div>
          <div>
            <span id="checkout-given-label" className="text-gray-400 text-sm block mb-1">Gegeben</span>
            <div
              role="textbox"
              aria-readonly="true"
              aria-labelledby="checkout-given-label"
              className="w-full h-14 bg-gray-700 text-white text-2xl rounded-lg px-3 flex items-center justify-end"
            >
              {given}
            </div>
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

          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => setQuick(total.toFixed(2).replace(".", ","))}
              className={EXACT_KEY}
            >
              Passend ({euro(total)})
            </button>
            {NOTES.map((n) => (
              <button key={n} type="button" onClick={() => setQuick(String(n))} className={NOTE_KEY}>
                {n} €
              </button>
            ))}
          </div>

          <Keypad onKey={onKey} extraKey="," />
        </div>

        <div className="grid grid-cols-2 gap-2 mt-6">
          <button
            type="button"
            onClick={onConfirm}
            className="bg-green-600 hover:bg-green-500 text-white rounded-lg py-4 font-bold"
          >
            Abschließen & Drucken
          </button>
          <button
            type="button"
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
