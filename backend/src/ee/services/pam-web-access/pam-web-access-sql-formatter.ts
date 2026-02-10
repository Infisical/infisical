import { builtins } from "pg-types";

// PostgreSQL numeric type OIDs for right-alignment
const NUMERIC_TYPE_IDS = new Set([
  builtins.INT8,
  builtins.INT2,
  builtins.INT4,
  builtins.OID,
  builtins.FLOAT4,
  builtins.FLOAT8,
  builtins.MONEY,
  builtins.NUMERIC
]);

type TQueryResult = {
  command: string;
  rowCount: number | null;
  fields: Array<{ name: string; dataTypeID: number }>;
  rows: Record<string, unknown>[];
};

/**
 * Formats a SELECT query result as a psql-style ASCII table.
 */
export const formatTable = (result: TQueryResult): string => {
  const { fields, rows } = result;

  if (!fields || fields.length === 0) {
    return "";
  }

  // Convert all values to display strings.
  // With raw type parsers all values are already strings, but handle
  // Date/Buffer/Array defensively in case parsed types slip through.
  const displayRows = rows.map((row) =>
    fields.map((field) => {
      const val = row[field.name];
      if (val === null || val === undefined) return "";
      if (val instanceof Date) return val.toISOString().replace("T", " ").replace("Z", "+00");
      if (Buffer.isBuffer(val)) return `\\x${val.toString("hex")}`;
      if (Array.isArray(val)) return `{${val.map((v) => String(v ?? "NULL")).join(",")}}`;
      return String(val);
    })
  );

  // Calculate column widths: max of header length and all value lengths
  const colWidths = fields.map((field, colIdx) => {
    let maxLen = field.name.length;
    for (const row of displayRows) {
      if (row[colIdx].length > maxLen) {
        maxLen = row[colIdx].length;
      }
    }
    return maxLen;
  });

  // Determine alignment per column
  const isNumeric = fields.map((field) => NUMERIC_TYPE_IDS.has(field.dataTypeID));

  // Build header row
  const headerCells = fields.map((field, i) => ` ${field.name.padEnd(colWidths[i])} `);
  const headerLine = headerCells.join("|");

  // Build separator row
  const separatorCells = colWidths.map((w) => "-".repeat(w + 2));
  const separatorLine = separatorCells.join("+");

  // Build data rows
  const dataLines = displayRows.map((row) => {
    const cells = row.map((val, i) => {
      const padded = isNumeric[i] ? val.padStart(colWidths[i]) : val.padEnd(colWidths[i]);
      return ` ${padded} `;
    });
    return cells.join("|");
  });

  // Footer
  const rowCount = rows.length;
  const footer = `(${rowCount} ${rowCount === 1 ? "row" : "rows"})`;

  // Assemble
  const parts = [headerLine, separatorLine, ...dataLines, footer, ""];
  return parts.join("\n");
};

/**
 * Formats a DML/DDL command result (e.g. "INSERT 0 3", "CREATE TABLE", "BEGIN").
 */
export const formatCommandResult = (result: TQueryResult): string => {
  const { command, rowCount } = result;
  if (rowCount != null && rowCount > 0) {
    // INSERT returns "INSERT 0 <count>" in psql
    if (command === "INSERT") {
      return `INSERT 0 ${rowCount}\n`;
    }
    // UPDATE, DELETE return "<COMMAND> <count>"
    return `${command} ${rowCount}\n`;
  }
  return `${command}\n`;
};

/**
 * Formats a PostgreSQL error in psql style.
 */
export const formatError = (err: unknown): string => {
  if (err && typeof err === "object") {
    const pgErr = err as { message?: string; detail?: string; hint?: string; severity?: string };
    const parts: string[] = [];
    parts.push(`ERROR:  ${pgErr.message ?? "Unknown error"}\n`);
    if (pgErr.detail) {
      parts.push(`DETAIL:  ${pgErr.detail}\n`);
    }
    if (pgErr.hint) {
      parts.push(`HINT:  ${pgErr.hint}\n`);
    }
    return parts.join("");
  }
  return `ERROR:  ${String(err)}\n`;
};
