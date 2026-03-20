// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck -- vendored Dice UI component, large file with complex generic types pending cleanup
/* eslint-disable no-restricted-syntax, no-nested-ternary, no-continue, no-param-reassign, @typescript-eslint/no-shadow, jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/role-supports-aria-props */

import * as React from "react";
import { Check, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@app/components/v3/generic/Badge";
import { Button } from "@app/components/v3/generic/Button";
import { Calendar } from "@app/components/v3/generic/Calendar";
import { Checkbox } from "@app/components/v3/generic/Checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from "@app/components/v3/generic/Command";
import { Popover, PopoverAnchor, PopoverContent } from "@app/components/v3/generic/Popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3/generic/Select";
import { Skeleton } from "@app/components/v3/generic/Skeleton";
import { TextArea as Textarea } from "@app/components/v3/generic/TextArea";
import { cn } from "@app/components/v3/utils";

import { useBadgeOverflow } from "./hooks/use-badge-overflow";
import { useDebouncedCallback } from "./hooks/use-debounced-callback";
import { DataGridCellWrapper } from "./data-grid-cell-wrapper";
import type { DataGridCellProps, FileCellData } from "./data-grid-types";
import {
  formatDateForDisplay,
  formatDateToString,
  formatFileSize,
  getCellKey,
  getFileIcon,
  getLineCount,
  getUrlHref,
  parseLocalDate
} from "./data-grid-utils";

export function ShortTextCell<TData>({
  cell,
  tableMeta,
  rowIndex,
  columnId,
  rowHeight,
  isEditing,
  isFocused,
  isSelected,
  isSearchMatch,
  isActiveSearchMatch,
  isDirty,
  readOnly
}: DataGridCellProps<TData>) {
  const initialValue = cell.getValue() as string;
  const [value, setValue] = React.useState(initialValue);
  const cellRef = React.useRef<HTMLDivElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const prefilledRef = React.useRef<string | null>(null);

  const prevInitialValueRef = React.useRef(initialValue);
  if (initialValue !== prevInitialValueRef.current) {
    prevInitialValueRef.current = initialValue;
    setValue(initialValue);
    if (cellRef.current && !isEditing) {
      cellRef.current.textContent = initialValue ?? "";
    }
  }

  // When commit + discard are batched by React 18, the intermediate initialValue
  // change is never seen, so prevInitialValueRef misses it and value stays stale.
  // Reset value to match initialValue when not editing to prevent showing stale data.
  if (!isEditing && value !== initialValue) {
    setValue(initialValue);
  }

  const onBlur = React.useCallback(() => {
    // Read the current value directly from the DOM to avoid stale state
    const currentValue = cellRef.current?.textContent ?? "";
    if (!readOnly && currentValue !== initialValue) {
      tableMeta?.onDataUpdate?.({ rowIndex, columnId, value: currentValue });
    }
    tableMeta?.onCellEditingStop?.();
  }, [tableMeta, rowIndex, columnId, initialValue, readOnly]);

  const onInput = React.useCallback((event: React.FormEvent<HTMLDivElement>) => {
    const currentValue = event.currentTarget.textContent ?? "";
    setValue(currentValue);
  }, []);

  const onWrapperKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (isEditing) {
        if (event.key === "Enter") {
          event.preventDefault();
          const currentValue = cellRef.current?.textContent ?? "";
          if (currentValue !== initialValue) {
            tableMeta?.onDataUpdate?.({
              rowIndex,
              columnId,
              value: currentValue
            });
          }
          tableMeta?.onCellEditingStop?.({ moveToNextRow: true });
        } else if (event.key === "Tab") {
          event.preventDefault();
          const currentValue = cellRef.current?.textContent ?? "";
          if (currentValue !== initialValue) {
            tableMeta?.onDataUpdate?.({
              rowIndex,
              columnId,
              value: currentValue
            });
          }
          tableMeta?.onCellEditingStop?.({
            direction: event.shiftKey ? "left" : "right"
          });
        } else if (event.key === "Escape") {
          event.preventDefault();
          setValue(initialValue);
          cellRef.current?.blur();
        }
      } else if (isFocused && event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
        // Handle typing to pre-fill the value when editing starts
        prefilledRef.current = event.key;
        setValue(event.key);

        queueMicrotask(() => {
          if (cellRef.current && cellRef.current.contentEditable === "true") {
            cellRef.current.textContent = event.key;
            const range = document.createRange();
            const selection = window.getSelection();
            range.selectNodeContents(cellRef.current);
            range.collapse(false);
            selection?.removeAllRanges();
            selection?.addRange(range);
          }
        });
      }
    },
    [isEditing, isFocused, initialValue, tableMeta, rowIndex, columnId]
  );

  React.useEffect(() => {
    if (isEditing && cellRef.current) {
      // Use pre-filled character if user typed to start editing,
      // otherwise always sync from initialValue to prevent stale values
      // (e.g. after batched commit+discard where prevInitialValueRef misses the change)
      const prefilled = prefilledRef.current;
      prefilledRef.current = null;
      const editValue = prefilled ?? initialValue ?? "";

      setValue(editValue);
      cellRef.current.textContent = editValue;
      cellRef.current.focus();

      if (cellRef.current.textContent) {
        const range = document.createRange();
        const selection = window.getSelection();
        range.selectNodeContents(cellRef.current);
        range.collapse(false);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
    // Only run on edit start — not on every value change (which moves cursor to end)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  const isNull = value === null || value === undefined;
  const displayValue = !isEditing ? (value ?? "") : "";

  return (
    <DataGridCellWrapper<TData>
      ref={containerRef}
      cell={cell}
      tableMeta={tableMeta}
      rowIndex={rowIndex}
      columnId={columnId}
      rowHeight={rowHeight}
      isEditing={isEditing}
      isFocused={isFocused}
      isSelected={isSelected}
      isSearchMatch={isSearchMatch}
      isActiveSearchMatch={isActiveSearchMatch}
      isDirty={isDirty}
      readOnly={readOnly}
      onKeyDown={onWrapperKeyDown}
    >
      {isNull && !isEditing ? (
        <span
          data-slot="grid-cell-content"
          className="text-xs text-muted-foreground/50 italic select-none"
        >
          NULL
        </span>
      ) : (
        <div
          role="textbox"
          data-slot="grid-cell-content"
          contentEditable={isEditing}
          tabIndex={-1}
          ref={cellRef}
          onBlur={onBlur}
          onInput={onInput}
          suppressContentEditableWarning
          className={cn("size-full overflow-hidden outline-none", {
            "whitespace-nowrap **:inline **:whitespace-nowrap [&_br]:hidden": isEditing
          })}
        >
          {displayValue}
        </div>
      )}
    </DataGridCellWrapper>
  );
}

export function LongTextCell<TData>({
  cell,
  tableMeta,
  rowIndex,
  columnId,
  rowHeight,
  isFocused,
  isEditing,
  isSelected,
  isSearchMatch,
  isActiveSearchMatch,
  isDirty,
  readOnly
}: DataGridCellProps<TData>) {
  const initialValue = cell.getValue() as string;
  const [value, setValue] = React.useState(initialValue ?? "");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const pendingCharRef = React.useRef<string | null>(null);
  const sideOffset = -(containerRef.current?.clientHeight ?? 0);

  const prevInitialValueRef = React.useRef(initialValue);
  if (initialValue !== prevInitialValueRef.current) {
    prevInitialValueRef.current = initialValue;
    setValue(initialValue ?? "");
  }

  if (!isEditing && value !== (initialValue ?? "")) {
    setValue(initialValue ?? "");
  }

  const debouncedSave = useDebouncedCallback((newValue: string) => {
    if (!readOnly) {
      tableMeta?.onDataUpdate?.({ rowIndex, columnId, value: newValue });
    }
  }, 300);

  const onSave = React.useCallback(() => {
    // Immediately save any pending changes and close the popover
    if (!readOnly && value !== initialValue) {
      tableMeta?.onDataUpdate?.({ rowIndex, columnId, value });
    }
    tableMeta?.onCellEditingStop?.();
  }, [tableMeta, value, initialValue, rowIndex, columnId, readOnly]);

  const onCancel = React.useCallback(() => {
    // Restore the original value
    setValue(initialValue ?? "");
    if (!readOnly) {
      tableMeta?.onDataUpdate?.({ rowIndex, columnId, value: initialValue });
    }
    tableMeta?.onCellEditingStop?.();
  }, [tableMeta, initialValue, rowIndex, columnId, readOnly]);

  const onOpenChange = React.useCallback(
    (open: boolean) => {
      if (open && !readOnly) {
        tableMeta?.onCellEditingStart?.(rowIndex, columnId);
      } else {
        // Immediately save any pending changes when closing
        if (!readOnly && value !== initialValue) {
          tableMeta?.onDataUpdate?.({ rowIndex, columnId, value });
        }
        tableMeta?.onCellEditingStop?.();
      }
    },
    [tableMeta, value, initialValue, rowIndex, columnId, readOnly]
  );

  const onOpenAutoFocus: NonNullable<
    React.ComponentProps<typeof PopoverContent>["onOpenAutoFocus"]
  > = React.useCallback((event) => {
    event.preventDefault();
    if (textareaRef.current) {
      textareaRef.current.focus();
      const { length } = textareaRef.current.value;
      textareaRef.current.setSelectionRange(length, length);

      // Insert pending character using execCommand so it's part of undo history
      // Use requestAnimationFrame to ensure focus has fully settled
      if (pendingCharRef.current) {
        const char = pendingCharRef.current;
        pendingCharRef.current = null;
        requestAnimationFrame(() => {
          if (textareaRef.current && document.activeElement === textareaRef.current) {
            document.execCommand("insertText", false, char);
            textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
          }
        });
      } else {
        textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
      }
    }
  }, []);

  const onWrapperKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (
        isFocused &&
        !isEditing &&
        !readOnly &&
        event.key.length === 1 &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        // Store the character to be inserted after textarea focuses
        // This ensures it's part of the textarea's undo history
        pendingCharRef.current = event.key;
      }
    },
    [isFocused, isEditing, readOnly]
  );

  const onBlur = React.useCallback(() => {
    // Immediately save any pending changes on blur
    if (!readOnly && value !== initialValue) {
      tableMeta?.onDataUpdate?.({ rowIndex, columnId, value });
    }
    tableMeta?.onCellEditingStop?.();
  }, [tableMeta, value, initialValue, rowIndex, columnId, readOnly]);

  const onChange = React.useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = event.target.value;
      setValue(newValue);
      debouncedSave(newValue);
    },
    [debouncedSave]
  );

  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCancel();
      } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        onSave();
      } else if (event.key === "Tab") {
        event.preventDefault();
        // Save any pending changes
        if (value !== initialValue) {
          tableMeta?.onDataUpdate?.({ rowIndex, columnId, value });
        }
        tableMeta?.onCellEditingStop?.({
          direction: event.shiftKey ? "left" : "right"
        });
        return;
      }
      // Stop propagation to prevent grid navigation
      event.stopPropagation();
    },
    [onSave, onCancel, value, initialValue, tableMeta, rowIndex, columnId]
  );

  return (
    <Popover open={isEditing} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <DataGridCellWrapper<TData>
          ref={containerRef}
          cell={cell}
          tableMeta={tableMeta}
          rowIndex={rowIndex}
          columnId={columnId}
          rowHeight={rowHeight}
          isEditing={isEditing}
          isFocused={isFocused}
          isSelected={isSelected}
          isSearchMatch={isSearchMatch}
          isActiveSearchMatch={isActiveSearchMatch}
          isDirty={isDirty}
          readOnly={readOnly}
          onKeyDown={onWrapperKeyDown}
        >
          <span data-slot="grid-cell-content">{value}</span>
        </DataGridCellWrapper>
      </PopoverAnchor>
      <PopoverContent
        data-grid-cell-editor=""
        align="start"
        side="bottom"
        sideOffset={sideOffset}
        className="w-[400px] rounded-none p-0"
        onOpenAutoFocus={onOpenAutoFocus}
      >
        <Textarea
          placeholder="Enter text..."
          className="max-h-[300px] min-h-[150px] resize-none overflow-y-auto rounded-none border-0 shadow-none focus-visible:ring-1 focus-visible:ring-ring"
          ref={textareaRef}
          value={value}
          onBlur={onBlur}
          onChange={onChange}
          onKeyDown={onKeyDown}
        />
      </PopoverContent>
    </Popover>
  );
}

export function NumberCell<TData>({
  cell,
  tableMeta,
  rowIndex,
  columnId,
  rowHeight,
  isFocused,
  isEditing,
  isSelected,
  isSearchMatch,
  isActiveSearchMatch,
  isDirty,
  readOnly
}: DataGridCellProps<TData>) {
  const initialValue = cell.getValue() as number;
  const [value, setValue] = React.useState(String(initialValue ?? ""));
  const inputRef = React.useRef<HTMLInputElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const cellOpts = cell.column.columnDef.meta?.cell;
  const numberCellOpts = cellOpts?.variant === "number" ? cellOpts : null;
  const min = numberCellOpts?.min;
  const max = numberCellOpts?.max;
  const step = numberCellOpts?.step;

  const prevIsEditingRef = React.useRef(isEditing);

  const prevInitialValueRef = React.useRef(initialValue);
  if (initialValue !== prevInitialValueRef.current) {
    prevInitialValueRef.current = initialValue;
    setValue(String(initialValue ?? ""));
  }

  const onBlur = React.useCallback(() => {
    const numValue = value === "" ? null : Number(value);
    if (!readOnly && numValue !== initialValue) {
      tableMeta?.onDataUpdate?.({ rowIndex, columnId, value: numValue });
    }
    tableMeta?.onCellEditingStop?.();
  }, [tableMeta, rowIndex, columnId, initialValue, value, readOnly]);

  const onChange = React.useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setValue(event.target.value);
  }, []);

  const onWrapperKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (isEditing) {
        if (event.key === "Enter") {
          event.preventDefault();
          const numValue = value === "" ? null : Number(value);
          if (numValue !== initialValue) {
            tableMeta?.onDataUpdate?.({ rowIndex, columnId, value: numValue });
          }
          tableMeta?.onCellEditingStop?.({ moveToNextRow: true });
        } else if (event.key === "Tab") {
          event.preventDefault();
          const numValue = value === "" ? null : Number(value);
          if (numValue !== initialValue) {
            tableMeta?.onDataUpdate?.({ rowIndex, columnId, value: numValue });
          }
          tableMeta?.onCellEditingStop?.({
            direction: event.shiftKey ? "left" : "right"
          });
        } else if (event.key === "Escape") {
          event.preventDefault();
          setValue(String(initialValue ?? ""));
          inputRef.current?.blur();
        }
      } else if (isFocused) {
        // Handle Backspace to start editing with empty value
        if (event.key === "Backspace") {
          setValue("");
        } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
          // Handle typing to pre-fill the value when editing starts
          setValue(event.key);
        }
      }
    },
    [isEditing, isFocused, initialValue, tableMeta, rowIndex, columnId, value]
  );

  React.useEffect(() => {
    const wasEditing = prevIsEditingRef.current;
    prevIsEditingRef.current = isEditing;

    // Only focus when we start editing (transition from false to true)
    if (isEditing && !wasEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  return (
    <DataGridCellWrapper<TData>
      ref={containerRef}
      cell={cell}
      tableMeta={tableMeta}
      rowIndex={rowIndex}
      columnId={columnId}
      rowHeight={rowHeight}
      isEditing={isEditing}
      isFocused={isFocused}
      isSelected={isSelected}
      isSearchMatch={isSearchMatch}
      isActiveSearchMatch={isActiveSearchMatch}
      isDirty={isDirty}
      readOnly={readOnly}
      onKeyDown={onWrapperKeyDown}
    >
      {isEditing ? (
        <input
          type="number"
          ref={inputRef}
          value={value}
          min={min}
          max={max}
          step={step}
          className="w-full [appearance:textfield] border-none bg-transparent p-0 outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          onBlur={onBlur}
          onChange={onChange}
        />
      ) : (
        <span data-slot="grid-cell-content">{value}</span>
      )}
    </DataGridCellWrapper>
  );
}

export function UrlCell<TData>({
  cell,
  tableMeta,
  rowIndex,
  columnId,
  rowHeight,
  isEditing,
  isFocused,
  isSelected,
  isSearchMatch,
  isActiveSearchMatch,
  isDirty,
  readOnly
}: DataGridCellProps<TData>) {
  const initialValue = cell.getValue() as string;
  const [value, setValue] = React.useState(initialValue ?? "");
  const cellRef = React.useRef<HTMLDivElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const prefilledRef = React.useRef<string | null>(null);

  const prevInitialValueRef = React.useRef(initialValue);
  if (initialValue !== prevInitialValueRef.current) {
    prevInitialValueRef.current = initialValue;
    setValue(initialValue ?? "");
    if (cellRef.current && !isEditing) {
      cellRef.current.textContent = initialValue ?? "";
    }
  }

  if (!isEditing && value !== (initialValue ?? "")) {
    setValue(initialValue ?? "");
  }

  const onBlur = React.useCallback(() => {
    const currentValue = cellRef.current?.textContent?.trim() ?? "";

    if (!readOnly && currentValue !== initialValue) {
      tableMeta?.onDataUpdate?.({
        rowIndex,
        columnId,
        value: currentValue || null
      });
    }
    tableMeta?.onCellEditingStop?.();
  }, [tableMeta, rowIndex, columnId, initialValue, readOnly]);

  const onInput = React.useCallback((event: React.FormEvent<HTMLDivElement>) => {
    const currentValue = event.currentTarget.textContent ?? "";
    setValue(currentValue);
  }, []);

  const onWrapperKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (isEditing) {
        if (event.key === "Enter") {
          event.preventDefault();
          const currentValue = cellRef.current?.textContent?.trim() ?? "";
          if (!readOnly && currentValue !== initialValue) {
            tableMeta?.onDataUpdate?.({
              rowIndex,
              columnId,
              value: currentValue || null
            });
          }
          tableMeta?.onCellEditingStop?.({ moveToNextRow: true });
        } else if (event.key === "Tab") {
          event.preventDefault();
          const currentValue = cellRef.current?.textContent?.trim() ?? "";
          if (!readOnly && currentValue !== initialValue) {
            tableMeta?.onDataUpdate?.({
              rowIndex,
              columnId,
              value: currentValue || null
            });
          }
          tableMeta?.onCellEditingStop?.({
            direction: event.shiftKey ? "left" : "right"
          });
        } else if (event.key === "Escape") {
          event.preventDefault();
          setValue(initialValue ?? "");
          cellRef.current?.blur();
        }
      } else if (
        isFocused &&
        !readOnly &&
        event.key.length === 1 &&
        !event.ctrlKey &&
        !event.metaKey
      ) {
        // Handle typing to pre-fill the value when editing starts
        prefilledRef.current = event.key;
        setValue(event.key);

        queueMicrotask(() => {
          if (cellRef.current && cellRef.current.contentEditable === "true") {
            cellRef.current.textContent = event.key;
            const range = document.createRange();
            const selection = window.getSelection();
            range.selectNodeContents(cellRef.current);
            range.collapse(false);
            selection?.removeAllRanges();
            selection?.addRange(range);
          }
        });
      }
    },
    [isEditing, isFocused, initialValue, tableMeta, rowIndex, columnId, readOnly]
  );

  const onLinkClick = React.useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      if (isEditing) {
        event.preventDefault();
        return;
      }

      // Check if URL was rejected due to dangerous protocol
      const href = getUrlHref(value);
      if (!href) {
        event.preventDefault();
        toast.error("Invalid URL", {
          description: "URL contains a dangerous protocol (javascript:, data:, vbscript:, or file:)"
        });
        return;
      }

      // Stop propagation to prevent grid from interfering with link navigation
      event.stopPropagation();
    },
    [isEditing, value]
  );

  React.useEffect(() => {
    if (isEditing && cellRef.current) {
      const prefilled = prefilledRef.current;
      prefilledRef.current = null;
      const editValue = prefilled ?? initialValue ?? "";

      setValue(editValue);
      cellRef.current.textContent = editValue;
      cellRef.current.focus();

      if (cellRef.current.textContent) {
        const range = document.createRange();
        const selection = window.getSelection();
        range.selectNodeContents(cellRef.current);
        range.collapse(false);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
    // Only run on edit start — not on every value change (which moves cursor to end)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing]);

  const displayValue = !isEditing ? (value ?? "") : "";
  const urlHref = displayValue ? getUrlHref(displayValue) : "";
  const isDangerousUrl = displayValue && !urlHref;

  return (
    <DataGridCellWrapper<TData>
      ref={containerRef}
      cell={cell}
      tableMeta={tableMeta}
      rowIndex={rowIndex}
      columnId={columnId}
      rowHeight={rowHeight}
      isEditing={isEditing}
      isFocused={isFocused}
      isSelected={isSelected}
      isSearchMatch={isSearchMatch}
      isActiveSearchMatch={isActiveSearchMatch}
      isDirty={isDirty}
      readOnly={readOnly}
      onKeyDown={onWrapperKeyDown}
    >
      {!isEditing && displayValue ? (
        <div data-slot="grid-cell-content" className="size-full overflow-hidden">
          <a
            data-focused={isFocused && !isDangerousUrl ? "" : undefined}
            data-invalid={isDangerousUrl ? "" : undefined}
            href={urlHref}
            target="_blank"
            rel="noopener noreferrer"
            className="data-invalid:text-destructive data-invalid:decoration-destructive/50 data-invalid:hover:decoration-destructive/70 truncate text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary/60 data-focused:text-foreground data-focused:decoration-foreground/50 data-focused:hover:decoration-foreground/70 data-invalid:cursor-not-allowed"
            onClick={onLinkClick}
          >
            {displayValue}
          </a>
        </div>
      ) : (
        <div
          role="textbox"
          data-slot="grid-cell-content"
          contentEditable={isEditing}
          tabIndex={-1}
          ref={cellRef}
          onBlur={onBlur}
          onInput={onInput}
          suppressContentEditableWarning
          className={cn("size-full overflow-hidden outline-none", {
            "whitespace-nowrap **:inline **:whitespace-nowrap [&_br]:hidden": isEditing
          })}
        >
          {displayValue}
        </div>
      )}
    </DataGridCellWrapper>
  );
}

export function CheckboxCell<TData>({
  cell,
  tableMeta,
  rowIndex,
  columnId,
  rowHeight,
  isFocused,
  isSelected,
  isSearchMatch,
  isActiveSearchMatch,
  readOnly
}: Omit<DataGridCellProps<TData>, "isEditing">) {
  const initialValue = cell.getValue() as boolean;
  const [value, setValue] = React.useState(Boolean(initialValue));
  const containerRef = React.useRef<HTMLDivElement>(null);

  const prevInitialValueRef = React.useRef(initialValue);
  if (initialValue !== prevInitialValueRef.current) {
    prevInitialValueRef.current = initialValue;
    setValue(Boolean(initialValue));
  }

  const onCheckedChange = React.useCallback(
    (checked: boolean) => {
      if (readOnly) return;
      setValue(checked);
      tableMeta?.onDataUpdate?.({ rowIndex, columnId, value: checked });
    },
    [tableMeta, rowIndex, columnId, readOnly]
  );

  const onWrapperKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (isFocused && !readOnly && (event.key === " " || event.key === "Enter")) {
        event.preventDefault();
        event.stopPropagation();
        onCheckedChange(!value);
      } else if (isFocused && event.key === "Tab") {
        event.preventDefault();
        tableMeta?.onCellEditingStop?.({
          direction: event.shiftKey ? "left" : "right"
        });
      }
    },
    [isFocused, value, onCheckedChange, tableMeta, readOnly]
  );

  const onWrapperClick = React.useCallback(
    (event: React.MouseEvent) => {
      if (isFocused && !readOnly) {
        event.preventDefault();
        event.stopPropagation();
        onCheckedChange(!value);
      }
    },
    [isFocused, value, onCheckedChange, readOnly]
  );

  const onCheckboxClick = React.useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
  }, []);

  const onCheckboxMouseDown = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  }, []);

  const onCheckboxDoubleClick = React.useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
  }, []);

  return (
    <DataGridCellWrapper<TData>
      ref={containerRef}
      cell={cell}
      tableMeta={tableMeta}
      rowIndex={rowIndex}
      columnId={columnId}
      rowHeight={rowHeight}
      isEditing={false}
      isFocused={isFocused}
      isSelected={isSelected}
      isSearchMatch={isSearchMatch}
      isActiveSearchMatch={isActiveSearchMatch}
      isDirty={isDirty}
      readOnly={readOnly}
      className="flex size-full justify-center"
      onClick={onWrapperClick}
      onKeyDown={onWrapperKeyDown}
    >
      <Checkbox
        checked={value}
        onCheckedChange={onCheckedChange}
        disabled={readOnly}
        className="border-primary"
        onClick={onCheckboxClick}
        onMouseDown={onCheckboxMouseDown}
        onDoubleClick={onCheckboxDoubleClick}
      />
    </DataGridCellWrapper>
  );
}

export function SelectCell<TData>({
  cell,
  tableMeta,
  rowIndex,
  columnId,
  rowHeight,
  isFocused,
  isEditing,
  isSelected,
  isSearchMatch,
  isActiveSearchMatch,
  isDirty,
  readOnly
}: DataGridCellProps<TData>) {
  const initialValue = cell.getValue() as string;
  const [value, setValue] = React.useState(initialValue);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const cellOpts = cell.column.columnDef.meta?.cell;
  const options = cellOpts?.variant === "select" ? cellOpts.options : [];

  const prevInitialValueRef = React.useRef(initialValue);
  if (initialValue !== prevInitialValueRef.current) {
    prevInitialValueRef.current = initialValue;
    setValue(initialValue);
  }

  const onValueChange = React.useCallback(
    (newValue: string) => {
      if (readOnly) return;
      setValue(newValue);
      tableMeta?.onDataUpdate?.({ rowIndex, columnId, value: newValue });
      tableMeta?.onCellEditingStop?.();
    },
    [tableMeta, rowIndex, columnId, readOnly]
  );

  const onOpenChange = React.useCallback(
    (open: boolean) => {
      if (open && !readOnly) {
        tableMeta?.onCellEditingStart?.(rowIndex, columnId);
      } else {
        tableMeta?.onCellEditingStop?.();
      }
    },
    [tableMeta, rowIndex, columnId, readOnly]
  );

  const onWrapperKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (isEditing && event.key === "Escape") {
        event.preventDefault();
        setValue(initialValue);
        tableMeta?.onCellEditingStop?.();
      } else if (isFocused && event.key === "Tab") {
        event.preventDefault();
        tableMeta?.onCellEditingStop?.({
          direction: event.shiftKey ? "left" : "right"
        });
      }
    },
    [isEditing, isFocused, initialValue, tableMeta]
  );

  const displayLabel = options.find((opt) => opt.value === value)?.label ?? value;

  return (
    <DataGridCellWrapper<TData>
      ref={containerRef}
      cell={cell}
      tableMeta={tableMeta}
      rowIndex={rowIndex}
      columnId={columnId}
      rowHeight={rowHeight}
      isEditing={isEditing}
      isFocused={isFocused}
      isSelected={isSelected}
      isSearchMatch={isSearchMatch}
      isActiveSearchMatch={isActiveSearchMatch}
      isDirty={isDirty}
      readOnly={readOnly}
      onKeyDown={onWrapperKeyDown}
    >
      {isEditing ? (
        <Select
          value={value}
          onValueChange={onValueChange}
          open={isEditing}
          onOpenChange={onOpenChange}
        >
          <SelectTrigger
            size="sm"
            className="size-full items-start border-none bg-transparent p-0 shadow-none focus-visible:ring-0 [&_svg]:hidden"
          >
            {displayLabel ? (
              <Badge variant="secondary" className="px-1.5 py-px whitespace-pre-wrap">
                <SelectValue />
              </Badge>
            ) : (
              <SelectValue />
            )}
          </SelectTrigger>
          <SelectContent
            data-grid-cell-editor=""
            // compensate for the wrapper padding
            align="start"
            alignOffset={-8}
            sideOffset={-8}
            className="min-w-[calc(var(--radix-select-trigger-width)+16px)]"
          >
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : displayLabel ? (
        <Badge
          data-slot="grid-cell-content"
          variant="secondary"
          className="px-1.5 py-px whitespace-pre-wrap"
        >
          {displayLabel}
        </Badge>
      ) : null}
    </DataGridCellWrapper>
  );
}

export function MultiSelectCell<TData>({
  cell,
  tableMeta,
  rowIndex,
  columnId,
  rowHeight,
  isFocused,
  isEditing,
  isSelected,
  isSearchMatch,
  isActiveSearchMatch,
  isDirty,
  readOnly
}: DataGridCellProps<TData>) {
  const cellValue = React.useMemo(() => {
    const value = cell.getValue() as string[];
    return value ?? [];
  }, [cell]);

  const cellKey = getCellKey(rowIndex, columnId);
  const prevCellKeyRef = React.useRef(cellKey);

  const [selectedValues, setSelectedValues] = React.useState<string[]>(cellValue);
  const [searchValue, setSearchValue] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const cellOpts = cell.column.columnDef.meta?.cell;
  const options = cellOpts?.variant === "multi-select" ? cellOpts.options : [];
  const sideOffset = -(containerRef.current?.clientHeight ?? 0);

  const prevCellValueRef = React.useRef(cellValue);
  if (cellValue !== prevCellValueRef.current) {
    prevCellValueRef.current = cellValue;
    setSelectedValues(cellValue);
  }

  if (prevCellKeyRef.current !== cellKey) {
    prevCellKeyRef.current = cellKey;
    setSearchValue("");
  }

  const onValueChange = React.useCallback(
    (value: string) => {
      if (readOnly) return;
      const newValues = selectedValues.includes(value)
        ? selectedValues.filter((v) => v !== value)
        : [...selectedValues, value];

      setSelectedValues(newValues);
      tableMeta?.onDataUpdate?.({ rowIndex, columnId, value: newValues });
      setSearchValue("");
      queueMicrotask(() => inputRef.current?.focus());
    },
    [selectedValues, tableMeta, rowIndex, columnId, readOnly]
  );

  const removeValue = React.useCallback(
    (valueToRemove: string, event?: React.MouseEvent) => {
      if (readOnly) return;
      event?.stopPropagation();
      event?.preventDefault();
      const newValues = selectedValues.filter((v) => v !== valueToRemove);
      setSelectedValues(newValues);
      tableMeta?.onDataUpdate?.({ rowIndex, columnId, value: newValues });
      // Focus back on input after removing
      setTimeout(() => inputRef.current?.focus(), 0);
    },
    [selectedValues, tableMeta, rowIndex, columnId, readOnly]
  );

  const clearAll = React.useCallback(() => {
    if (readOnly) return;
    setSelectedValues([]);
    tableMeta?.onDataUpdate?.({ rowIndex, columnId, value: [] });
    queueMicrotask(() => inputRef.current?.focus());
  }, [tableMeta, rowIndex, columnId, readOnly]);

  const onOpenChange = React.useCallback(
    (open: boolean) => {
      if (open && !readOnly) {
        tableMeta?.onCellEditingStart?.(rowIndex, columnId);
      } else {
        setSearchValue("");
        tableMeta?.onCellEditingStop?.();
      }
    },
    [tableMeta, rowIndex, columnId, readOnly]
  );

  const onOpenAutoFocus: NonNullable<
    React.ComponentProps<typeof PopoverContent>["onOpenAutoFocus"]
  > = React.useCallback((event) => {
    event.preventDefault();
    inputRef.current?.focus();
  }, []);

  const onWrapperKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (isEditing && event.key === "Escape") {
        event.preventDefault();
        setSelectedValues(cellValue);
        setSearchValue("");
        tableMeta?.onCellEditingStop?.();
      } else if (isFocused && event.key === "Tab") {
        event.preventDefault();
        setSearchValue("");
        tableMeta?.onCellEditingStop?.({
          direction: event.shiftKey ? "left" : "right"
        });
      }
    },
    [isEditing, isFocused, cellValue, tableMeta]
  );

  const onInputKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      // Handle backspace when input is empty - remove last selected item
      if (event.key === "Backspace" && searchValue === "" && selectedValues.length > 0) {
        event.preventDefault();
        const lastValue = selectedValues[selectedValues.length - 1];
        if (lastValue) {
          removeValue(lastValue);
        }
      }
      // Prevent escape from propagating to close the popover immediately
      // Let the command handle it first
      if (event.key === "Escape") {
        event.stopPropagation();
      }
    },
    [searchValue, selectedValues, removeValue]
  );

  const displayLabels = selectedValues
    .map((val) => options.find((opt) => opt.value === val)?.label ?? val)
    .filter(Boolean);

  const lineCount = getLineCount(rowHeight);

  const { visibleItems: visibleLabels, hiddenCount: hiddenBadgeCount } = useBadgeOverflow({
    items: displayLabels,
    getLabel: (label) => label,
    containerRef,
    lineCount
  });

  return (
    <DataGridCellWrapper<TData>
      ref={containerRef}
      cell={cell}
      tableMeta={tableMeta}
      rowIndex={rowIndex}
      columnId={columnId}
      rowHeight={rowHeight}
      isEditing={isEditing}
      isFocused={isFocused}
      isSelected={isSelected}
      isSearchMatch={isSearchMatch}
      isActiveSearchMatch={isActiveSearchMatch}
      isDirty={isDirty}
      readOnly={readOnly}
      onKeyDown={onWrapperKeyDown}
    >
      {isEditing ? (
        <Popover open={isEditing} onOpenChange={onOpenChange}>
          <PopoverAnchor asChild>
            <div className="absolute inset-0" />
          </PopoverAnchor>
          <PopoverContent
            data-grid-cell-editor=""
            align="start"
            sideOffset={sideOffset}
            className="w-[300px] rounded-none p-0"
            onOpenAutoFocus={onOpenAutoFocus}
          >
            <Command className="**:data-[slot=command-input-wrapper]:h-auto **:data-[slot=command-input-wrapper]:border-none **:data-[slot=command-input-wrapper]:p-0 [&_[data-slot=command-input-wrapper]_svg]:hidden">
              <div className="flex min-h-9 flex-wrap items-center gap-1 border-b px-3 py-1.5">
                {selectedValues.map((value) => {
                  const option = options.find((opt) => opt.value === value);
                  const label = option?.label ?? value;

                  return (
                    <Badge key={value} variant="secondary" className="gap-1 px-1.5 py-px">
                      {label}
                      <button
                        type="button"
                        onClick={(event) => removeValue(value, event)}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  );
                })}
                <CommandInput
                  ref={inputRef}
                  value={searchValue}
                  onValueChange={setSearchValue}
                  onKeyDown={onInputKeyDown}
                  placeholder="Search..."
                  className="h-auto flex-1 p-0"
                />
              </div>
              <CommandList className="max-h-full">
                <CommandEmpty>No options found.</CommandEmpty>
                <CommandGroup className="max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto">
                  {options.map((option) => {
                    const isSelected = selectedValues.includes(option.value);

                    return (
                      <CommandItem
                        key={option.value}
                        value={option.label}
                        onSelect={() => onValueChange(option.value)}
                      >
                        <div
                          className={cn(
                            "flex size-4 items-center justify-center rounded-sm border border-primary",
                            isSelected
                              ? "text-primary-foreground bg-primary"
                              : "opacity-50 [&_svg]:invisible"
                          )}
                        >
                          <Check className="size-3" />
                        </div>
                        <span>{option.label}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
                {selectedValues.length > 0 && (
                  <>
                    <CommandSeparator />
                    <CommandGroup>
                      <CommandItem
                        onSelect={clearAll}
                        className="justify-center text-muted-foreground"
                      >
                        Clear all
                      </CommandItem>
                    </CommandGroup>
                  </>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      ) : null}
      {displayLabels.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1 overflow-hidden">
          {visibleLabels.map((label, index) => (
            <Badge key={selectedValues[index]} variant="secondary" className="px-1.5 py-px">
              {label}
            </Badge>
          ))}
          {hiddenBadgeCount > 0 && (
            <Badge variant="outline" className="px-1.5 py-px text-muted-foreground">
              +{hiddenBadgeCount}
            </Badge>
          )}
        </div>
      ) : null}
    </DataGridCellWrapper>
  );
}

export function DateCell<TData>({
  cell,
  tableMeta,
  rowIndex,
  columnId,
  rowHeight,
  isFocused,
  isEditing,
  isSelected,
  isSearchMatch,
  isActiveSearchMatch,
  isDirty,
  readOnly
}: DataGridCellProps<TData>) {
  const initialValue = cell.getValue() as string;
  const [value, setValue] = React.useState(initialValue ?? "");
  const containerRef = React.useRef<HTMLDivElement>(null);

  const prevInitialValueRef = React.useRef(initialValue);
  if (initialValue !== prevInitialValueRef.current) {
    prevInitialValueRef.current = initialValue;
    setValue(initialValue ?? "");
  }

  // Parse date as local time to avoid timezone shifts
  const selectedDate = value ? (parseLocalDate(value) ?? undefined) : undefined;

  const onDateSelect = React.useCallback(
    (date: Date | undefined) => {
      if (!date || readOnly) return;

      // Format using local date components to avoid timezone issues
      const formattedDate = formatDateToString(date);
      setValue(formattedDate);
      tableMeta?.onDataUpdate?.({ rowIndex, columnId, value: formattedDate });
      tableMeta?.onCellEditingStop?.();
    },
    [tableMeta, rowIndex, columnId, readOnly]
  );

  const onOpenChange = React.useCallback(
    (open: boolean) => {
      if (open && !readOnly) {
        tableMeta?.onCellEditingStart?.(rowIndex, columnId);
      } else {
        tableMeta?.onCellEditingStop?.();
      }
    },
    [tableMeta, rowIndex, columnId, readOnly]
  );

  const onWrapperKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (isEditing && event.key === "Escape") {
        event.preventDefault();
        setValue(initialValue);
        tableMeta?.onCellEditingStop?.();
      } else if (isFocused && event.key === "Tab") {
        event.preventDefault();
        tableMeta?.onCellEditingStop?.({
          direction: event.shiftKey ? "left" : "right"
        });
      }
    },
    [isEditing, isFocused, initialValue, tableMeta]
  );

  return (
    <DataGridCellWrapper<TData>
      ref={containerRef}
      cell={cell}
      tableMeta={tableMeta}
      rowIndex={rowIndex}
      columnId={columnId}
      rowHeight={rowHeight}
      isEditing={isEditing}
      isFocused={isFocused}
      isSelected={isSelected}
      isSearchMatch={isSearchMatch}
      isActiveSearchMatch={isActiveSearchMatch}
      isDirty={isDirty}
      readOnly={readOnly}
      onKeyDown={onWrapperKeyDown}
    >
      <Popover open={isEditing} onOpenChange={onOpenChange}>
        <PopoverAnchor asChild>
          <span data-slot="grid-cell-content">{formatDateForDisplay(value)}</span>
        </PopoverAnchor>
        {isEditing && (
          <PopoverContent
            data-grid-cell-editor=""
            align="start"
            alignOffset={-8}
            className="w-auto p-0"
          >
            <Calendar
              autoFocus
              captionLayout="dropdown"
              mode="single"
              defaultMonth={selectedDate ?? new Date()}
              selected={selectedDate}
              onSelect={onDateSelect}
            />
          </PopoverContent>
        )}
      </Popover>
    </DataGridCellWrapper>
  );
}

export function FileCell<TData>({
  cell,
  tableMeta,
  rowIndex,
  columnId,
  rowHeight,
  isFocused,
  isEditing,
  isSelected,
  isSearchMatch,
  isActiveSearchMatch,
  isDirty,
  readOnly
}: DataGridCellProps<TData>) {
  const cellValue = React.useMemo(() => (cell.getValue() as FileCellData[]) ?? [], [cell]);

  const cellKey = getCellKey(rowIndex, columnId);
  const prevCellKeyRef = React.useRef(cellKey);

  const labelId = React.useId();
  const descriptionId = React.useId();

  const [files, setFiles] = React.useState<FileCellData[]>(cellValue);
  const [uploadingFiles, setUploadingFiles] = React.useState<Set<string>>(new Set());
  const [deletingFiles, setDeletingFiles] = React.useState<Set<string>>(new Set());
  const [isDraggingOver, setIsDraggingOver] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isUploading = uploadingFiles.size > 0;
  const isDeleting = deletingFiles.size > 0;
  const isPending = isUploading || isDeleting;
  const containerRef = React.useRef<HTMLDivElement>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const dropzoneRef = React.useRef<HTMLDivElement>(null);
  const cellOpts = cell.column.columnDef.meta?.cell;
  const sideOffset = -(containerRef.current?.clientHeight ?? 0);

  const fileCellOpts = cellOpts?.variant === "file" ? cellOpts : null;
  const maxFileSize = fileCellOpts?.maxFileSize ?? 10 * 1024 * 1024;
  const maxFiles = fileCellOpts?.maxFiles ?? 10;
  const accept = fileCellOpts?.accept;
  const multiple = fileCellOpts?.multiple ?? false;

  const acceptedTypes = React.useMemo(
    () => (accept ? accept.split(",").map((t) => t.trim()) : null),
    [accept]
  );

  const prevCellValueRef = React.useRef(cellValue);
  if (cellValue !== prevCellValueRef.current) {
    prevCellValueRef.current = cellValue;
    for (const file of files) {
      if (file.url) {
        URL.revokeObjectURL(file.url);
      }
    }
    setFiles(cellValue);
    setError(null);
  }

  if (prevCellKeyRef.current !== cellKey) {
    prevCellKeyRef.current = cellKey;
    setError(null);
  }

  const validateFile = React.useCallback(
    (file: File): string | null => {
      if (maxFileSize && file.size > maxFileSize) {
        return `File size exceeds ${formatFileSize(maxFileSize)}`;
      }
      if (acceptedTypes) {
        const fileExtension = `.${file.name.split(".").pop()}`;
        const isAccepted = acceptedTypes.some((type) => {
          if (type.endsWith("/*")) {
            const baseType = type.slice(0, -2);
            return file.type.startsWith(`${baseType}/`);
          }
          if (type.startsWith(".")) {
            return fileExtension.toLowerCase() === type.toLowerCase();
          }
          return file.type === type;
        });
        if (!isAccepted) {
          return "File type not accepted";
        }
      }
      return null;
    },
    [maxFileSize, acceptedTypes]
  );

  const addFiles = React.useCallback(
    async (newFiles: File[], skipUpload = false) => {
      if (readOnly || isPending) return;
      setError(null);

      if (maxFiles && files.length + newFiles.length > maxFiles) {
        const errorMessage = `Maximum ${maxFiles} files allowed`;
        setError(errorMessage);
        toast(errorMessage);
        setTimeout(() => {
          setError(null);
        }, 2000);
        return;
      }

      const rejectedFiles: Array<{ name: string; reason: string }> = [];
      const filesToValidate: File[] = [];

      for (const file of newFiles) {
        const validationError = validateFile(file);
        if (validationError) {
          rejectedFiles.push({ name: file.name, reason: validationError });
          continue;
        }
        filesToValidate.push(file);
      }

      if (rejectedFiles.length > 0) {
        const firstError = rejectedFiles[0];
        if (firstError) {
          setError(firstError.reason);

          const truncatedName =
            firstError.name.length > 20 ? `${firstError.name.slice(0, 20)}...` : firstError.name;

          if (rejectedFiles.length === 1) {
            toast(firstError.reason, {
              description: `"${truncatedName}" has been rejected`
            });
          } else {
            toast(firstError.reason, {
              description: `"${truncatedName}" and ${rejectedFiles.length - 1} more rejected`
            });
          }

          setTimeout(() => {
            setError(null);
          }, 2000);
        }
      }

      if (filesToValidate.length > 0) {
        if (!skipUpload) {
          const tempFiles = filesToValidate.map((f) => ({
            id: crypto.randomUUID(),
            name: f.name,
            size: f.size,
            type: f.type,
            url: undefined
          }));
          const filesWithTemp = [...files, ...tempFiles];
          setFiles(filesWithTemp);

          const uploadingIds = new Set(tempFiles.map((f) => f.id));
          setUploadingFiles(uploadingIds);

          let uploadedFiles: FileCellData[] = [];

          if (tableMeta?.onFilesUpload) {
            try {
              uploadedFiles = await tableMeta.onFilesUpload({
                files: filesToValidate,
                rowIndex,
                columnId
              });
            } catch (error) {
              toast.error(
                error instanceof Error
                  ? error.message
                  : `Failed to upload ${filesToValidate.length} file${filesToValidate.length !== 1 ? "s" : ""}`
              );
              setFiles((prev) => prev.filter((f) => !uploadingIds.has(f.id)));
              setUploadingFiles(new Set());
              return;
            }
          } else {
            uploadedFiles = filesToValidate.map((f, i) => ({
              id: tempFiles[i]?.id ?? crypto.randomUUID(),
              name: f.name,
              size: f.size,
              type: f.type,
              url: URL.createObjectURL(f)
            }));
          }

          const finalFiles = filesWithTemp
            .map((f) => {
              if (uploadingIds.has(f.id)) {
                return uploadedFiles.find((uf) => uf.name === f.name) ?? f;
              }
              return f;
            })
            .filter((f) => f.url !== undefined);

          setFiles(finalFiles);
          setUploadingFiles(new Set());
          tableMeta?.onDataUpdate?.({ rowIndex, columnId, value: finalFiles });
        } else {
          const newFilesData: FileCellData[] = filesToValidate.map((f) => ({
            id: crypto.randomUUID(),
            name: f.name,
            size: f.size,
            type: f.type,
            url: URL.createObjectURL(f)
          }));
          const updatedFiles = [...files, ...newFilesData];
          setFiles(updatedFiles);
          tableMeta?.onDataUpdate?.({
            rowIndex,
            columnId,
            value: updatedFiles
          });
        }
      }
    },
    [files, maxFiles, validateFile, tableMeta, rowIndex, columnId, readOnly, isPending]
  );

  const removeFile = React.useCallback(
    async (fileId: string) => {
      if (readOnly || isPending) return;
      setError(null);

      const fileToRemove = files.find((f) => f.id === fileId);
      if (!fileToRemove) return;

      setDeletingFiles((prev) => new Set(prev).add(fileId));

      if (tableMeta?.onFilesDelete) {
        try {
          await tableMeta.onFilesDelete({
            fileIds: [fileId],
            rowIndex,
            columnId
          });
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : `Failed to delete ${fileToRemove.name}`
          );
          setDeletingFiles((prev) => {
            const next = new Set(prev);
            next.delete(fileId);
            return next;
          });
          return;
        }
      }

      if (fileToRemove.url?.startsWith("blob:")) {
        URL.revokeObjectURL(fileToRemove.url);
      }

      const updatedFiles = files.filter((f) => f.id !== fileId);
      setFiles(updatedFiles);
      setDeletingFiles((prev) => {
        const next = new Set(prev);
        next.delete(fileId);
        return next;
      });
      tableMeta?.onDataUpdate?.({ rowIndex, columnId, value: updatedFiles });
    },
    [files, tableMeta, rowIndex, columnId, readOnly, isPending]
  );

  const clearAll = React.useCallback(async () => {
    if (readOnly || isPending) return;
    setError(null);

    const fileIds = files.map((f) => f.id);
    setDeletingFiles(new Set(fileIds));

    if (tableMeta?.onFilesDelete && files.length > 0) {
      try {
        await tableMeta.onFilesDelete({
          fileIds,
          rowIndex,
          columnId
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to delete files");
        setDeletingFiles(new Set());
        return;
      }
    }

    for (const file of files) {
      if (file.url?.startsWith("blob:")) {
        URL.revokeObjectURL(file.url);
      }
    }
    setFiles([]);
    setDeletingFiles(new Set());
    tableMeta?.onDataUpdate?.({ rowIndex, columnId, value: [] });
  }, [files, tableMeta, rowIndex, columnId, readOnly, isPending]);

  const onCellDragEnter = React.useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer.types.includes("Files")) {
      setIsDraggingOver(true);
    }
  }, []);

  const onCellDragLeave = React.useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX;
    const y = event.clientY;

    if (x <= rect.left || x >= rect.right || y <= rect.top || y >= rect.bottom) {
      setIsDraggingOver(false);
    }
  }, []);

  const onCellDragOver = React.useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const onCellDrop = React.useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDraggingOver(false);

      const droppedFiles = Array.from(event.dataTransfer.files);
      if (droppedFiles.length > 0) {
        addFiles(droppedFiles, false);
      }
    },
    [addFiles]
  );

  const onDropzoneDragEnter = React.useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  }, []);

  const onDropzoneDragLeave = React.useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX;
    const y = event.clientY;

    if (x <= rect.left || x >= rect.right || y <= rect.top || y >= rect.bottom) {
      setIsDragging(false);
    }
  }, []);

  const onDropzoneDragOver = React.useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const onDropzoneDrop = React.useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(false);

      const droppedFiles = Array.from(event.dataTransfer.files);
      addFiles(droppedFiles, false);
    },
    [addFiles]
  );

  const onDropzoneClick = React.useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onDropzoneKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onDropzoneClick();
      }
    },
    [onDropzoneClick]
  );

  const onFileInputChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = Array.from(event.target.files ?? []);
      addFiles(selectedFiles, false);
      event.target.value = "";
    },
    [addFiles]
  );

  const onOpenChange = React.useCallback(
    (open: boolean) => {
      if (open && !readOnly) {
        setError(null);
        tableMeta?.onCellEditingStart?.(rowIndex, columnId);
      } else {
        setError(null);
        tableMeta?.onCellEditingStop?.();
      }
    },
    [tableMeta, rowIndex, columnId, readOnly]
  );

  const onEscapeKeyDown: NonNullable<
    React.ComponentProps<typeof PopoverContent>["onEscapeKeyDown"]
  > = React.useCallback((event) => {
    // Prevent the escape key from propagating to the data grid's keyboard handler
    // which would call blurCell() and remove focus from the cell
    event.stopPropagation();
  }, []);

  const onOpenAutoFocus: NonNullable<
    React.ComponentProps<typeof PopoverContent>["onOpenAutoFocus"]
  > = React.useCallback((event) => {
    event.preventDefault();
    queueMicrotask(() => {
      dropzoneRef.current?.focus();
    });
  }, []);

  const onWrapperKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (isEditing) {
        if (event.key === "Escape") {
          event.preventDefault();
          setFiles(cellValue);
          setError(null);
          tableMeta?.onCellEditingStop?.();
        } else if (event.key === " ") {
          event.preventDefault();
          onDropzoneClick();
        } else if (event.key === "Tab") {
          event.preventDefault();
          tableMeta?.onCellEditingStop?.({
            direction: event.shiftKey ? "left" : "right"
          });
        }
      } else if (isFocused && event.key === "Enter") {
        event.preventDefault();
        tableMeta?.onCellEditingStart?.(rowIndex, columnId);
      } else if (isFocused && event.key === "Tab") {
        event.preventDefault();
        tableMeta?.onCellEditingStop?.({
          direction: event.shiftKey ? "left" : "right"
        });
      }
    },
    [isEditing, isFocused, cellValue, tableMeta, onDropzoneClick, rowIndex, columnId]
  );

  React.useEffect(() => {
    return () => {
      for (const file of files) {
        if (file.url) {
          URL.revokeObjectURL(file.url);
        }
      }
    };
  }, [files]);

  const lineCount = getLineCount(rowHeight);

  const { visibleItems: visibleFiles, hiddenCount: hiddenFileCount } = useBadgeOverflow({
    items: files,
    getLabel: (file) => file.name,
    containerRef,
    lineCount,
    cacheKeyPrefix: "file",
    iconSize: 12,
    maxWidth: 100
  });

  return (
    <DataGridCellWrapper<TData>
      ref={containerRef}
      cell={cell}
      tableMeta={tableMeta}
      rowIndex={rowIndex}
      columnId={columnId}
      rowHeight={rowHeight}
      isEditing={isEditing}
      isFocused={isFocused}
      isSelected={isSelected}
      isSearchMatch={isSearchMatch}
      isActiveSearchMatch={isActiveSearchMatch}
      isDirty={isDirty}
      readOnly={readOnly}
      className={cn({
        "ring-1 ring-primary/80 ring-inset": isDraggingOver
      })}
      onDragEnter={onCellDragEnter}
      onDragLeave={onCellDragLeave}
      onDragOver={onCellDragOver}
      onDrop={onCellDrop}
      onKeyDown={onWrapperKeyDown}
    >
      {isEditing ? (
        <Popover open={isEditing} onOpenChange={onOpenChange}>
          <PopoverAnchor asChild>
            <div className="absolute inset-0" />
          </PopoverAnchor>
          <PopoverContent
            data-grid-cell-editor=""
            align="start"
            sideOffset={sideOffset}
            className="w-[400px] rounded-none p-0"
            onEscapeKeyDown={onEscapeKeyDown}
            onOpenAutoFocus={onOpenAutoFocus}
          >
            <div className="flex flex-col gap-2 p-3">
              <span id={labelId} className="sr-only">
                File upload
              </span>
              <div
                role="region"
                aria-labelledby={labelId}
                aria-describedby={descriptionId}
                aria-invalid={!!error}
                aria-disabled={isPending}
                data-dragging={isDragging ? "" : undefined}
                data-invalid={error ? "" : undefined}
                data-disabled={isPending ? "" : undefined}
                tabIndex={isDragging || isPending ? -1 : 0}
                className="data-invalid:border-destructive data-invalid:ring-destructive/20 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed p-6 transition-colors outline-none hover:bg-accent/30 focus-visible:border-ring/50 data-disabled:pointer-events-none data-disabled:opacity-50 data-dragging:border-primary/30 data-dragging:bg-accent/30"
                ref={dropzoneRef}
                onClick={onDropzoneClick}
                onDragEnter={onDropzoneDragEnter}
                onDragLeave={onDropzoneDragLeave}
                onDragOver={onDropzoneDragOver}
                onDrop={onDropzoneDrop}
                onKeyDown={onDropzoneKeyDown}
              >
                <Upload className="size-8 text-muted-foreground" />
                <div className="text-center text-sm">
                  <p className="font-medium">
                    {isDragging ? "Drop files here" : "Drag files here"}
                  </p>
                  <p className="text-xs text-muted-foreground">or click to browse</p>
                </div>
                <p id={descriptionId} className="text-xs text-muted-foreground">
                  {maxFileSize
                    ? `Max size: ${formatFileSize(maxFileSize)}${maxFiles ? ` • Max ${maxFiles} files` : ""}`
                    : maxFiles
                      ? `Max ${maxFiles} files`
                      : "Select files to upload"}
                </p>
              </div>
              <input
                type="file"
                aria-labelledby={labelId}
                aria-describedby={descriptionId}
                multiple={multiple}
                accept={accept}
                className="sr-only"
                ref={fileInputRef}
                onChange={onFileInputChange}
              />
              {files.length > 0 && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">
                      {files.length} {files.length === 1 ? "file" : "files"}
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs text-muted-foreground"
                      onClick={clearAll}
                      disabled={isPending}
                    >
                      Clear all
                    </Button>
                  </div>
                  <div className="max-h-[200px] space-y-1 overflow-y-auto">
                    {files.map((file) => {
                      const FileIcon = getFileIcon(file.type);
                      const isFileUploading = uploadingFiles.has(file.id);
                      const isFileDeleting = deletingFiles.has(file.id);
                      const isFilePending = isFileUploading || isFileDeleting;

                      return (
                        <div
                          key={file.id}
                          data-pending={isFilePending ? "" : undefined}
                          className="flex items-center gap-2 rounded-md border bg-muted/50 px-2 py-1.5 data-pending:opacity-60"
                        >
                          {FileIcon && (
                            <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                          )}
                          <div className="flex-1 overflow-hidden">
                            <p className="truncate text-sm">{file.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {isFileUploading
                                ? "Uploading..."
                                : isFileDeleting
                                  ? "Deleting..."
                                  : formatFileSize(file.size)}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-5 rounded-sm"
                            onClick={() => removeFile(file.id)}
                            disabled={isPending}
                          >
                            <X className="size-3" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      ) : null}
      {isDraggingOver ? (
        <div className="flex items-center justify-center gap-2 text-sm text-primary">
          <Upload className="size-4" />
          <span>Drop files here</span>
        </div>
      ) : files.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1 overflow-hidden">
          {visibleFiles.map((file) => {
            // eslint-disable-next-line @typescript-eslint/no-shadow
            const isUploading = uploadingFiles.has(file.id);

            if (isUploading) {
              return (
                <Skeleton
                  key={file.id}
                  className="h-5 shrink-0 px-1.5"
                  style={{
                    width: `${Math.min(file.name.length * 8 + 30, 100)}px`
                  }}
                />
              );
            }

            const FileIcon = getFileIcon(file.type);

            return (
              <Badge key={file.id} variant="secondary" className="gap-1 px-1.5 py-px">
                {FileIcon && <FileIcon className="size-3 shrink-0" />}
                <span className="max-w-[100px] truncate">{file.name}</span>
              </Badge>
            );
          })}
          {hiddenFileCount > 0 && (
            <Badge variant="outline" className="px-1.5 py-px text-muted-foreground">
              +{hiddenFileCount}
            </Badge>
          )}
        </div>
      ) : null}
    </DataGridCellWrapper>
  );
}
