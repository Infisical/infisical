export type TableRowActivityType = "quick-add" | "secret" | "secret-import" | "secret-rotation";

export type TableRowActivityId = `${TableRowActivityType}:${string}`;

export type TableRowActivityChangeHandler = (rowId: TableRowActivityId, isActive: boolean) => void;

export const getTableRowActivityId = (
  type: TableRowActivityType,
  ...identity: string[]
): TableRowActivityId => `${type}:${JSON.stringify(identity)}`;
