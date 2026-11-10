export type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
export type KeypadKey = Digit | "," | "back" | "clear";

const MAX_EURO_DIGITS = 5;

/**
 * What a keypad key does to the entered text. An amount is German-formatted
 * ("10,5"): one comma, at most two decimals, no leading zero. A PIN takes digits only.
 */
export function applyKey(value: string, key: KeypadKey, mode: "pin" | "amount"): string {
  if (key === "clear") return "";
  if (key === "back") return value.slice(0, -1);
  if (mode === "pin") return key === "," ? value : value + key;

  const [euros, cents] = value.split(",");
  if (key === ",") return cents !== undefined ? value : (euros || "0") + ",";
  if (cents !== undefined) return cents.length < 2 ? value + key : value;
  if (euros === "0") return key;
  return euros.length < MAX_EURO_DIGITS ? value + key : value;
}
