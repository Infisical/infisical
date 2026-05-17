export type ExportFormat = "csv" | "json";

const FORMULA_PREFIXES = new Set(["=", "+", "-", "@"]);

function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  let str = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (FORMULA_PREFIXES.has(str.charAt(0))) {
    str = `'${str}`;
  }
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildTimestamp(): string {
  return new Date()
    .toISOString()
    .replace(/[:]/g, "-")
    .replace(/\.\d+Z$/, "Z");
}

function buildCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.map(escapeCsvField).join(",");
  const body = rows
    .map((row) => columns.map((col) => escapeCsvField(row[col])).join(","))
    .join("\n");
  return `${header}\n${body}`;
}

function buildJson(rows: Record<string, unknown>[], columns: string[]): string {
  const filtered = rows.map((row) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col) => {
      obj[col] = row[col] ?? null;
    });
    return obj;
  });
  return JSON.stringify(filtered, null, 2);
}

function serialize(
  rows: Record<string, unknown>[],
  columns: string[],
  format: ExportFormat
): string {
  return format === "json" ? buildJson(rows, columns) : buildCsv(rows, columns);
}

export function exportData(
  rows: Record<string, unknown>[],
  columns: string[],
  format: ExportFormat
): void {
  if (rows.length === 0) return;
  const content = serialize(rows, columns, format);
  const mime = format === "json" ? "application/json;charset=utf-8;" : "text/csv;charset=utf-8;";
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `infisical_data_${buildTimestamp()}.${format}`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function copyData(
  rows: Record<string, unknown>[],
  columns: string[],
  format: ExportFormat
): Promise<void> {
  if (rows.length === 0) return;
  await navigator.clipboard.writeText(serialize(rows, columns, format));
}
