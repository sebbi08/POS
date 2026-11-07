export const euro = (x: number): string => x.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
