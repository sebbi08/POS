export function formatEuro(value: number): string {
  return value.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

// Current calendar day in Europe/Berlin as YYYY-MM-DD, matching the backend's day buckets.
export function todayIso(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
}
