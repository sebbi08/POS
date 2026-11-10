import { useCallback, useEffect, useRef, useState } from "react";
import { applyKey, type KeypadKey } from "../domain/keypad-entry";
import Keypad from "./Keypad";

interface Props {
  onSubmit: (pin: string) => void;
  onCancel: () => void;
}

/** Asks for the admin PIN before a sync. The PIN lives only in this dialog until it is submitted. */
function PinDialog({ onSubmit, onCancel }: Props) {
  const [pin, setPin] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  // Take the focus so no field behind the dialog receives hardware keystrokes.
  useEffect(() => dialogRef.current?.focus(), []);

  const submit = useCallback(() => {
    if (pin) onSubmit(pin);
  }, [pin, onSubmit]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
      if (e.key === "Enter") {
        e.preventDefault(); // a focused keypad button must not be pressed as well
        submit();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel, submit]);

  const onKey = useCallback((key: KeypadKey) => setPin((p) => applyKey(p, key, "pin")), []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pin-title"
        className="bg-gray-800 rounded-xl p-6 w-96 shadow-2xl outline-none"
      >
        <h2 id="pin-title" className="text-white text-xl font-bold mb-4">Admin-PIN</h2>
        <div
          role="textbox"
          aria-readonly="true"
          aria-label="Eingegebene PIN"
          className="w-full h-14 bg-gray-700 text-white text-2xl tracking-[0.4em] rounded-lg px-3 flex items-center justify-center mb-4"
        >
          {"●".repeat(pin.length)}
        </div>
        <Keypad onKey={onKey} extraKey="clear" />
        <div className="grid grid-cols-2 gap-2 mt-6">
          <button
            type="button"
            onClick={submit}
            disabled={!pin}
            className="bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white rounded-lg py-4 font-bold"
          >
            OK
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

export default PinDialog;
