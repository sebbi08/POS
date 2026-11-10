import { useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { Digit, KeypadKey } from "../domain/keypad-entry";

interface Props {
  onKey: (key: KeypadKey) => void;
  /** Bottom-left key: the comma for amounts, "clear" for a PIN. */
  extraKey: "," | "clear";
}

const DIGITS: Digit[] = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** Tap feedback: a touch screen has no hover. */
const KEY = "rounded-lg font-semibold active:brightness-125";

/** A keypad key; function keys (comma, clear, backspace) stand apart from the digits. */
function Key({ fn = false, ...props }: { fn?: boolean; onClick: () => void; "aria-label"?: string; children: ReactNode }) {
  return <Button type="button" size="key" variant={fn ? "outline" : "secondary"} className={KEY} {...props} />;
}

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
        <Key key={d} onClick={() => onKey(d)}>{d}</Key>
      ))}
      {extraKey === "," ? (
        <Key fn aria-label="Komma" onClick={() => onKey(",")}>,</Key>
      ) : (
        <Key fn aria-label="Alles löschen" onClick={() => onKey("clear")}>C</Key>
      )}
      <Key onClick={() => onKey("0")}>0</Key>
      <Key fn aria-label="Letzte Ziffer löschen" onClick={() => onKey("back")}>⌫</Key>
    </div>
  );
}

export default Keypad;
