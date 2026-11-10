import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { TouchDialog } from "@/components/ui/touch-dialog";
import { applyKey, type KeypadKey } from "../domain/keypad-entry";
import Keypad from "./Keypad";

interface Props {
  onSubmit: (pin: string) => void;
  onCancel: () => void;
}

/** Asks for the admin PIN before a sync. The PIN lives only in this dialog until it is submitted. */
function PinDialog({ onSubmit, onCancel }: Props) {
  const [pin, setPin] = useState("");

  const submit = useCallback(() => {
    if (pin) onSubmit(pin);
  }, [pin, onSubmit]);

  // Escape is handled by the dialog itself (escapeCloses).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault(); // a focused keypad button must not be pressed as well
        submit();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [submit]);

  const onKey = useCallback((key: KeypadKey) => setPin((p) => applyKey(p, key, "pin")), []);

  return (
    <TouchDialog title="Admin-PIN" onClose={onCancel} escapeCloses className="w-96">
      <div
        role="textbox"
        aria-readonly="true"
        aria-label="Eingegebene PIN"
        className="w-full h-14 bg-muted text-2xl tracking-[0.4em] rounded-lg px-3 flex items-center justify-center"
      >
        {"●".repeat(pin.length)}
      </div>
      <Keypad onKey={onKey} extraKey="clear" />
      <div className="grid grid-cols-2 gap-2 mt-2">
        <Button type="button" size="touch-lg" onClick={submit} disabled={!pin}>
          OK
        </Button>
        <Button type="button" variant="secondary" size="touch-lg" onClick={onCancel}>
          Abbrechen
        </Button>
      </div>
    </TouchDialog>
  );
}

export default PinDialog;
