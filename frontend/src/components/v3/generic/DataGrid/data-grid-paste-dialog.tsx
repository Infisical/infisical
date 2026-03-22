import * as React from "react";
import type { TableMeta } from "@tanstack/react-table";

import { Button } from "@app/components/v3/generic/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v3/generic/Dialog";
import { cn } from "@app/components/v3/utils";

import { useAsRef } from "./hooks/use-as-ref";
import type { PasteDialogState } from "./data-grid-types";

interface DataGridPasteDialogProps<TData> {
  tableMeta: TableMeta<TData>;
  pasteDialog: PasteDialogState;
}

export function DataGridPasteDialog<TData>({
  tableMeta,
  pasteDialog
}: DataGridPasteDialogProps<TData>) {
  const onPasteDialogOpenChange = tableMeta?.onPasteDialogOpenChange;
  const onCellsPaste = tableMeta?.onCellsPaste;

  if (!pasteDialog.open) return null;

  return (
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    <PasteDialog
      pasteDialog={pasteDialog}
      onPasteDialogOpenChange={onPasteDialogOpenChange}
      onCellsPaste={onCellsPaste}
    />
  );
}

interface PasteDialogProps
  extends Pick<TableMeta<unknown>, "onPasteDialogOpenChange" | "onCellsPaste">,
    Required<Pick<TableMeta<unknown>, "pasteDialog">> {}

// eslint-disable-next-line @typescript-eslint/no-use-before-define
const PasteDialog = React.memo(PasteDialogImpl, (prev, next) => {
  if (prev.pasteDialog.open !== next.pasteDialog.open) return false;
  if (!next.pasteDialog.open) return true;
  if (prev.pasteDialog.rowsNeeded !== next.pasteDialog.rowsNeeded) return false;

  return true;
});

function PasteDialogImpl({ pasteDialog, onPasteDialogOpenChange, onCellsPaste }: PasteDialogProps) {
  const propsRef = useAsRef({
    onPasteDialogOpenChange,
    onCellsPaste
  });

  const expandRadioRef = React.useRef<HTMLInputElement | null>(null);

  const onOpenChange = React.useCallback(
    (open: boolean) => {
      propsRef.current.onPasteDialogOpenChange?.(open);
    },
    [propsRef]
  );

  const onCancel = React.useCallback(() => {
    propsRef.current.onPasteDialogOpenChange?.(false);
  }, [propsRef]);

  const onContinue = React.useCallback(() => {
    propsRef.current.onCellsPaste?.(expandRadioRef.current?.checked ?? false);
  }, [propsRef]);

  return (
    <Dialog open={pasteDialog.open} onOpenChange={onOpenChange}>
      <DialogContent data-grid-popover="">
        <DialogHeader>
          <DialogTitle>Do you want to add more rows?</DialogTitle>
          <DialogDescription>
            We need <strong>{pasteDialog.rowsNeeded}</strong> additional row
            {pasteDialog.rowsNeeded !== 1 ? "s" : ""} to paste everything from your clipboard.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-1">
          {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
          <label className="flex cursor-pointer items-start gap-3">
            {/* eslint-disable-next-line @typescript-eslint/no-use-before-define */}
            <RadioItem ref={expandRadioRef} name="expand-option" value="expand" defaultChecked />
            <div className="flex flex-col gap-1">
              <span className="text-sm leading-none font-medium">Create new rows</span>
              <span className="text-sm text-muted">
                Add {pasteDialog.rowsNeeded} new row
                {pasteDialog.rowsNeeded !== 1 ? "s" : ""} to the table and paste all data
              </span>
            </div>
          </label>
          {/* eslint-disable-next-line jsx-a11y/label-has-associated-control */}
          <label className="flex cursor-pointer items-start gap-3">
            {/* eslint-disable-next-line @typescript-eslint/no-use-before-define */}
            <RadioItem name="expand-option" value="no-expand" />
            <div className="flex flex-col gap-1">
              <span className="text-sm leading-none font-medium">Keep current rows</span>
              <span className="text-sm text-muted">
                Paste only what fits in the existing rows
              </span>
            </div>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onContinue}>Continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// eslint-disable-next-line react/prop-types
function RadioItem({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type="radio"
      className={cn(
        "border-input relative size-4 shrink-0 appearance-none rounded-full border bg-background shadow-xs transition-[color,box-shadow] outline-none",
        "text-primary focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "checked:before:absolute checked:before:start-1/2 checked:before:top-1/2 checked:before:size-2 checked:before:-translate-x-1/2 checked:before:-translate-y-1/2 checked:before:rounded-full checked:before:bg-primary checked:before:content-['']",
        "bg-input/30",
        className
      )}
      {...props}
    />
  );
}
