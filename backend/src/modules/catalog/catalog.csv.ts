import { ImportRow } from "./catalog.types.js";

export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

export function escapeCsvField(value: string | number): string {
  const str = String(value);
  if (
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function formatCsvRow(data: (string | number)[]): string {
  return data.map(escapeCsvField).join(",");
}

const EXPECTED_HEADER = ["id", "name", "group_name", "group_vat_rate", "price"];

export function parseCsv(text: string): { rows: ImportRow[]; error?: string } {
  const trimmed = text.trimEnd();
  if (!trimmed) {
    return { rows: [], error: "CSV-Datei ist leer" };
  }

  const lines = trimmed.split("\n");
  const header = parseCsvLine(lines[0]);

  const missing = EXPECTED_HEADER.filter((h) => !header.includes(h));
  if (missing.length > 0 || header.length !== EXPECTED_HEADER.length) {
    return {
      rows: [],
      error: `Ungültige CSV: erwartete Spalten ${EXPECTED_HEADER.join(",")}`,
    };
  }

  const idIdx = header.indexOf("id");
  const nameIdx = header.indexOf("name");
  const groupNameIdx = header.indexOf("group_name");
  const groupVatRateIdx = header.indexOf("group_vat_rate");
  const priceIdx = header.indexOf("price");

  const rows: ImportRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "") continue;
    const parts = parseCsvLine(line);
    if (parts.length < EXPECTED_HEADER.length) {
      return {
        rows: [],
        error: `Zeile ${i + 1}: Felder fehlen (erwartet ${EXPECTED_HEADER.length}, erhalten ${parts.length})`,
      };
    }
    const row: ImportRow = {
      id: parts[idIdx].trim(),
      name: parts[nameIdx].trim(),
      groupName: parts[groupNameIdx].trim(),
      groupVatRate: parts[groupVatRateIdx].trim(),
      price: parts[priceIdx].trim(),
    };
    if (!row.id) return { rows: [], error: `Zeile ${i + 1}: id fehlt` };
    if (!row.name) return { rows: [], error: `Zeile ${i + 1}: name fehlt` };
    if (!row.groupName)
      return { rows: [], error: `Zeile ${i + 1}: group_name fehlt` };
    if (!row.groupVatRate)
      return { rows: [], error: `Zeile ${i + 1}: group_vat_rate fehlt` };
    if (!row.price) return { rows: [], error: `Zeile ${i + 1}: price fehlt` };
    rows.push(row);
  }

  if (rows.length === 0) {
    return { rows: [], error: "CSV-Datei enthält keine Datenzeilen" };
  }

  // Check duplicate IDs in file
  const allIds = rows.map((r) => r.id);
  for (const id of new Set(allIds)) {
    const count = allIds.filter((x) => x === id).length;
    if (count > 1) {
      const indices = rows
        .map((r, i) => (r.id === id ? i + 2 : -1))
        .filter((i) => i > 0);
      return {
        rows: [],
        error: `Doppelte ID ${id} in den Zeilen ${indices.join(" und ")}`,
      };
    }
  }

  return { rows };
}
