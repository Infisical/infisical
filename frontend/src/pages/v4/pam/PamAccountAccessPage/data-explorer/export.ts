export type ExportFormat = "csv" | "json";

const FORMULA_PREFIXES = new Set(["=", "+", "-", "@"]);

const escapeCsvField = (value: unknown) => {
  if (value === null || value === undefined) return "";
  let text = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (FORMULA_PREFIXES.has(text.charAt(0))) text = `'${text}`;
  if (/[,"\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
};

const timestamp = () =>
  new Date()
    .toISOString()
    .replace(/[:]/g, "-")
    .replace(/\.\d+Z$/, "Z");

const serialize = (rows: Record<string, unknown>[], columns: string[], format: ExportFormat) => {
  if (format === "json")
    return JSON.stringify(
      rows.map((row) => Object.fromEntries(columns.map((column) => [column, row[column] ?? null]))),
      null,
      2
    );
  const header = columns.map(escapeCsvField).join(",");
  const body = rows
    .map((row) => columns.map((column) => escapeCsvField(row[column])).join(","))
    .join("\n");
  return `${header}\n${body}`;
};

export const exportRows = (
  rows: Record<string, unknown>[],
  columns: string[],
  format: ExportFormat
) => {
  if (rows.length === 0) return;
  const blob = new Blob([serialize(rows, columns, format)], {
    type: format === "json" ? "application/json;charset=utf-8;" : "text/csv;charset=utf-8;"
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `infisical_data_${timestamp()}.${format}`;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const copyRows = async (
  rows: Record<string, unknown>[],
  columns: string[],
  format: ExportFormat
) => {
  if (rows.length === 0) return;
  await navigator.clipboard.writeText(serialize(rows, columns, format));
};
