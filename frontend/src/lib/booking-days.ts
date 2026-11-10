export type BookingDay = { day: string; orderCount: number };
export type Festival = { from: string; to: string; orderCount: number };

const parts = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Calendar-day arithmetic via UTC, so DST never shifts the result. */
export function addDays(iso: string, n: number): string {
  const { y, m, d } = parts(iso);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** ISO day -> local midnight. */
export function isoToDate(iso: string): Date {
  const { y, m, d } = parts(iso);
  return new Date(y, m - 1, d);
}

/** Local date fields -> ISO day (never toISOString). */
export function dateToIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function groupFestivals(days: BookingDay[], limit = 5): Festival[] {
  const sorted = [...days].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  const festivals: Festival[] = [];
  for (const { day, orderCount } of sorted) {
    const last = festivals[festivals.length - 1];
    if (last && addDays(last.to, 1) === day) {
      last.to = day;
      last.orderCount += orderCount;
    } else {
      festivals.push({ from: day, to: day, orderCount });
    }
  }
  return festivals.reverse().slice(0, limit);
}

const germanDate = (iso: string) => {
  const { y, m, d } = parts(iso);
  return `${pad(d)}.${pad(m)}.${y}`;
};

export function formatRangeLabel(from: string, to: string): string {
  if (from === to) return germanDate(from);
  const a = parts(from);
  const b = parts(to);
  if (a.y === b.y) return `${pad(a.d)}.${pad(a.m)}. – ${germanDate(to)}`;
  return `${germanDate(from)} – ${germanDate(to)}`;
}

const MONTHS = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

export function formatFestivalLabel(f: Festival): string {
  const a = parts(f.from);
  const b = parts(f.to);
  if (f.from === f.to) return `${a.d}. ${MONTHS[a.m - 1]} ${a.y}`;
  if (a.y === b.y && a.m === b.m) return `${a.d}.–${b.d}. ${MONTHS[b.m - 1]} ${b.y}`;
  if (a.y === b.y) return `${a.d}. ${MONTHS[a.m - 1]} – ${b.d}. ${MONTHS[b.m - 1]} ${b.y}`;
  return `${a.d}. ${MONTHS[a.m - 1]} ${a.y} – ${b.d}. ${MONTHS[b.m - 1]} ${b.y}`;
}

export function formatCount(n: number): string {
  return `${n.toLocaleString("de-DE")} ${n === 1 ? "Buchung" : "Buchungen"}`;
}
