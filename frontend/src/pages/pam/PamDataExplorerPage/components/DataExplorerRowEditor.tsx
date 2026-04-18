// NOTE: This component is not currently wired up but is kept for future use
// as a side-sheet row editor for the data explorer grid.
import { useEffect, useState } from "react";

import { Badge } from "@app/components/v3/generic/Badge";
import { Button } from "@app/components/v3/generic/Button";
import { Input } from "@app/components/v3/generic/Input";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3/generic/Sheet";
import { TextArea } from "@app/components/v3/generic/TextArea";

import type { ColumnInfo } from "../data-explorer-types";

type DataExplorerRowEditorProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  row: Record<string, unknown> | null;
  columns: ColumnInfo[];
  primaryKeys: string[];
  onApply: (updates: Record<string, unknown>) => void;
};

const JSON_TYPES = new Set(["json", "jsonb", "xml"]);

export const DataExplorerRowEditor = ({
  isOpen,
  onOpenChange,
  row,
  columns,
  primaryKeys,
  onApply
}: DataExplorerRowEditorProps) => {
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (row) {
      const values: Record<string, string> = {};
      columns.forEach((col) => {
        const val = row[col.name];
        values[col.name] = val === null || val === undefined ? "" : String(val);
      });
      setFormValues(values);
    }
  }, [row, columns]);

  const handleApply = () => {
    const updates: Record<string, unknown> = {};
    columns.forEach((col) => {
      const newVal = formValues[col.name] ?? "";
      const oldVal = row?.[col.name];
      const oldStr = oldVal === null || oldVal === undefined ? "" : String(oldVal);
      if (newVal !== oldStr) {
        // If field is empty and column is nullable, set to null
        updates[col.name] = newVal === "" && col.nullable ? null : newVal;
      }
    });
    onApply(updates);
    onOpenChange(false);
  };

  const isPk = (colName: string) => primaryKeys.includes(colName);
  const isReadOnly = (col: ColumnInfo) => isPk(col.name) || col.identityGeneration === "ALWAYS";

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Edit Row</SheetTitle>
        </SheetHeader>
        <div className="space-y-3 py-4">
          {columns.map((col) => {
            const readOnly = isReadOnly(col);
            const value = formValues[col.name] ?? "";
            const isNull = row?.[col.name] === null;
            const isJsonType = JSON_TYPES.has(col.type.replace("[]", ""));

            return (
              <div key={col.name}>
                <div className="mb-1 flex items-center gap-2">
                  {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
                  <label
                    htmlFor={`row-editor-${col.name}`}
                    className="text-xs font-medium text-mineshaft-200"
                  >
                    {col.name}
                  </label>
                  <Badge variant="outline" className="text-[10px]">
                    {col.type}
                  </Badge>
                  {isPk(col.name) && <Badge className="text-[10px]">PK</Badge>}
                  {col.nullable && (
                    <Badge variant="outline" className="text-[10px]">
                      nullable
                    </Badge>
                  )}
                  {isNull && (
                    <Badge variant="outline" className="text-[10px] text-yellow-500">
                      NULL
                    </Badge>
                  )}
                </div>
                {isJsonType ? (
                  <TextArea
                    value={value}
                    onChange={(e) =>
                      setFormValues((prev) => ({ ...prev, [col.name]: e.target.value }))
                    }
                    disabled={readOnly}
                    className="font-mono text-xs"
                    rows={4}
                  />
                ) : (
                  <Input
                    value={value}
                    onChange={(e) =>
                      setFormValues((prev) => ({ ...prev, [col.name]: e.target.value }))
                    }
                    disabled={readOnly}
                    className="text-xs"
                    placeholder={isNull ? "NULL" : undefined}
                  />
                )}
              </div>
            );
          })}
        </div>
        <SheetFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="info" onClick={handleApply}>
            Apply
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
