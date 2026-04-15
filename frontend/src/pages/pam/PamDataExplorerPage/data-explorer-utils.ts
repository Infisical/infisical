import type { ForeignKeyInfo } from "./data-explorer-types";

export function getColumnIndicator(
  colName: string,
  primaryKeys: string[],
  fkMap: Map<string, ForeignKeyInfo>
): { type: "pk" | "fk"; tooltip?: string } | undefined {
  if (primaryKeys.includes(colName)) return { type: "pk" };
  const fk = fkMap.get(colName);
  if (fk) {
    const targetCol = fk.targetColumns[fk.columns.indexOf(colName)] ?? fk.targetColumns[0];
    return { type: "fk", tooltip: `\u2192 ${fk.targetSchema}.${fk.targetTable}(${targetCol})` };
  }
  return undefined;
}
