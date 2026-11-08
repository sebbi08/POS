import { useEffect, useState, type FormEvent } from "react";

interface Props {
  onSubmit: (pin: string) => void;
  onCancel: () => void;
}

/** Asks for the admin PIN before a sync. The PIN lives only in this dialog until it is submitted. */
function PinDialog({ onSubmit, onCancel }: Props) {
  const [pin, setPin] = useState("");

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (pin) onSubmit(pin);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="pin-title"
        onSubmit={submit}
        className="bg-gray-800 rounded-xl p-6 w-96 shadow-2xl"
      >
        <h2 id="pin-title" className="text-white text-xl font-bold mb-4">Admin-PIN</h2>
        <input
          aria-label="Admin-PIN"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="w-full bg-gray-700 text-white text-2xl tracking-widest rounded-lg px-3 py-3 outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="grid grid-cols-2 gap-2 mt-6">
          <button
            type="submit"
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
      </form>
    </div>
  );
}

export default PinDialog;
