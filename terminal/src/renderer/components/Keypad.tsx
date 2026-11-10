import { useEffect } from "react";
import type { Digit, KeypadKey } from "../domain/keypad-entry";

interface Props {
  onKey: (key: KeypadKey) => void;
  /** Bottom-left key: the comma for amounts, "clear" for a PIN. */
  extraKey: "," | "clear";
}

const DIGITS: Digit[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

const KEY = "h-14 rounded-lg text-white text-2xl font-semibold select-none touch-manipulation";
const DIGIT_KEY = `${KEY} bg-gray-700 hover:bg-gray-600 active:bg-gray-500`;
const FN_KEY = `${KEY} bg-gray-600 hover:bg-gray-500 active:bg-gray-400`;

/** Maps a hardware key to a keypad key; null if it means nothing here. */
function fromKeyboard(e: KeyboardEvent, extraKey: Props["extraKey"]): KeypadKey | null {
  if (e.ctrlKey || e.altKey || e.metaKey) return null;
  if (/^[0-9]$/.test(e.key)) return e.key as Digit;
  if (e.key === "Backspace") return "back";
  if ((e.key === "," || e.key === ".") && extraKey === ",") return ",";
  return null;
}

/**
 * On-screen number pad for touch use. It replaces text fields, so Windows never
 * opens its on-screen keyboard; a hardware keyboard still works.
 */
function Keypad({ onKey, extraKey }: Props) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = fromKeyboard(e, extraKey);
      if (key) onKey(key);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onKey, extraKey]);

  return (
    <div className="grid grid-cols-3 gap-2">
      {DIGITS.map((d) => (
        <button key={d} type="button" onClick={() => onKey(d)} className={DIGIT_KEY}>{d}</button>
      ))}
      {extraKey === "," ? (
        <button type="button" aria-label="Komma" onClick={() => onKey(",")} className={FN_KEY}>,</button>
      ) : (
        <button type="button" aria-label="Alles löschen" onClick={() => onKey("clear")} className={FN_KEY}>C</button>
      )}
      <button type="button" onClick={() => onKey("0")} className={DIGIT_KEY}>0</button>
      <button type="button" aria-label="Letzte Ziffer löschen" onClick={() => onKey("back")} className={FN_KEY}>⌫</button>
    </div>
  );
}

export default Keypad;
