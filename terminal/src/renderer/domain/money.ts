export function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/** VAT contained in a gross amount (same formula as the backend). */
export function vatOf(total: number, rate: number): number {
  return round2(total - total / (1 + rate / 100));
}
