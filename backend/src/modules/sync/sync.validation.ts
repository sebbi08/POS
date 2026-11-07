import { BookingEventType, BookingUpload } from "./sync.types.js";

const EVENT_TYPES: readonly BookingEventType[] = [
  "OrderOpened",
  "ItemAdded",
  "ItemRemoved",
  "FinalReceiptPrinted",
  "PickupReceiptPrinted",
  "OrderClosed",
  "OrderCancellationCreated",
];

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isNumber(v: unknown): boolean {
  return typeof v === "number" && Number.isFinite(v);
}

function isText(v: unknown): boolean {
  return typeof v === "string" && v.length > 0;
}

function isDate(v: unknown): boolean {
  return typeof v === "string" && !Number.isNaN(Date.parse(v));
}

const AMOUNT_FIELDS = ["qty", "unitPrice", "vatRate", "vatAmount", "total"];

/** An ItemAdded payload or one line of a cancellation. */
function isItemLine(d: unknown): boolean {
  return (
    isObject(d) &&
    isText(d.itemId) &&
    typeof d.name === "string" &&
    AMOUNT_FIELDS.every((f) => isNumber(d[f]))
  );
}

function hasTotals(d: Record<string, unknown>): boolean {
  return isNumber(d.totalGross) && isNumber(d.totalNet) && isObject(d.totalVat);
}

/** Returns a German error text, or null when the booking may be stored. */
export function validateUpload(
  u: BookingUpload,
  terminalId: string,
  isKnownSale: (id: string) => boolean,
): string | null {
  if (!isObject(u) || typeof u.orderId !== "string" || !u.orderId) {
    return "Buchungs-ID fehlt";
  }
  const { orderId, events } = u;
  if (!Array.isArray(events) || events.length === 0) {
    return "Buchung enthält keine Ereignisse";
  }
  for (const e of events) {
    if (!isObject(e) || !EVENT_TYPES.includes(e.type as BookingEventType)) {
      return "Unbekannter Ereignistyp";
    }
    if (!isObject(e.data)) return "Ereignisdaten fehlen";
    if (!isDate(e.occurredAt)) return "Ungültiger Zeitstempel";
  }

  if (events.some((e) => e.type === "OrderCancellationCreated")) {
    if (events.length !== 1) {
      return "Gegenbuchung muss aus genau einem Ereignis bestehen";
    }
    const data = events[0].data;
    if (data.id !== orderId) return "Buchungs-ID stimmt nicht überein";
    if (data.terminalId !== terminalId) {
      return "Buchung gehört zu einem anderen Terminal";
    }
    if (
      !Array.isArray(data.items) ||
      !data.items.every(isItemLine) ||
      !hasTotals(data) ||
      !isDate(data.createdAt) ||
      !isDate(data.closedAt)
    ) {
      return "Gegenbuchung enthält ungültige Daten";
    }
    if (typeof data.cancelsOrderId !== "string" || !isKnownSale(data.cancelsOrderId)) {
      return "Originalbuchung unbekannt oder bereits storniert";
    }
    return null;
  }

  const [first, ...rest] = events;
  if (first.type !== "OrderOpened") {
    return "Buchung beginnt nicht mit OrderOpened";
  }
  if (first.data.id !== orderId) return "Buchungs-ID stimmt nicht überein";
  if (first.data.terminalId !== terminalId) {
    return "Buchung gehört zu einem anderen Terminal";
  }
  // A further OrderOpened would overwrite whatever order its data.id names.
  if (rest.some((e) => e.type === "OrderOpened")) {
    return "Buchung darf nur einmal eröffnet werden";
  }
  if (rest.some((e) => e.data.orderId !== orderId)) {
    return "Buchungs-ID stimmt nicht überein";
  }
  for (const e of rest) {
    if (e.type === "ItemAdded" && !isItemLine(e.data)) {
      return "Artikelbuchung enthält ungültige Daten";
    }
    if (e.type === "OrderClosed" && !hasTotals(e.data)) {
      return "Abschluss enthält ungültige Summen";
    }
  }
  if (events[events.length - 1].type !== "OrderClosed") {
    return "Buchung ist nicht abgeschlossen";
  }
  return null;
}
