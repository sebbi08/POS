import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { TouchDialog } from "@/components/ui/touch-dialog";
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

/** Quick amounts keep today's larger label on the touch-sized button. */
const QUICK = "text-lg font-semibold";

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

  const onKey = useCallback((key: KeypadKey) => {
    setEntry((e) => {
      const base = e.replaceNext && key !== "back" ? "" : e.given;
      return { given: applyKey(base, key, "amount"), replaceNext: false };
    });
  }, []);

  const setQuick = (value: string) => setEntry({ given: value, replaceNext: true });

  return (
    <TouchDialog title="Bezahlen" onClose={onCancel} className="w-96 max-h-screen overflow-y-auto">
      <div className="space-y-3">
        <div className="flex justify-between text-2xl font-bold">
          <span>Summe</span>
          <span>{euro(total)}</span>
        </div>
        <div>
          <span id="checkout-given-label" className="text-muted-foreground text-sm block mb-1">Gegeben</span>
          <div
            role="textbox"
            aria-readonly="true"
            aria-labelledby="checkout-given-label"
            className="w-full h-14 bg-muted text-2xl rounded-lg px-3 flex items-center justify-end"
          >
            {given}
          </div>
        </div>
        <div className="flex justify-between text-2xl font-bold">
          <span>Rückgeld</span>
          {change === null ? (
            <span className="text-muted-foreground">–</span>
          ) : change < 0 ? (
            <span className="text-destructive text-lg">Betrag reicht nicht</span>
          ) : (
            <span className="text-green-400">{euro(change)}</span>
          )}
        </div>

        <div className="grid grid-cols-4 gap-2">
          <Button
            type="button"
            size="touch"
            onClick={() => setQuick(total.toFixed(2).replace(".", ","))}
            className={`${QUICK} col-span-4`}
          >
            Passend ({euro(total)})
          </Button>
          {NOTES.map((n) => (
            <Button key={n} type="button" variant="secondary" size="touch" onClick={() => setQuick(String(n))} className={QUICK}>
              {n} €
            </Button>
          ))}
        </div>

        <Keypad onKey={onKey} extraKey="," />
      </div>

      <div className="grid grid-cols-2 gap-2 mt-2">
        {/* whitespace-normal: the label wraps instead of overflowing the half-width button */}
        <Button type="button" size="touch-lg" onClick={onConfirm} className="whitespace-normal">
          Abschließen & Drucken
        </Button>
        <Button type="button" variant="secondary" size="touch-lg" onClick={onCancel}>
          Abbrechen
        </Button>
      </div>
    </TouchDialog>
  );
}

export default CheckoutDialog;
