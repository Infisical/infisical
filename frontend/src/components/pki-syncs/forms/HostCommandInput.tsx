import { useEffect, useRef, useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";

import { TextArea } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";

const OPEN_VARIABLE_PATTERN = /\{\{([a-zA-Z0-9_]*)$/;

const TRAILING_VARIABLE_PATTERN = /^[a-zA-Z0-9_]*(\}\})?/;

type Props = {
  id: string;
  value: string;
  onChange: (value: string) => void;
  variables: string[];
  descriptions: Record<string, string>;
  placeholder?: string;
  isError?: boolean;
  isDisabled?: boolean;
};

export const HostCommandInput = ({
  id,
  value,
  onChange,
  variables,
  descriptions,
  placeholder,
  isError,
  isDisabled
}: Props) => {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const query = OPEN_VARIABLE_PATTERN.exec(value.slice(0, cursor))?.[1] ?? null;
  const variableStart = query === null ? -1 : cursor - query.length;

  const matches =
    query === null
      ? []
      : variables.filter((variable) => variable.toLowerCase().startsWith(query.toLowerCase()));

  const isOpen = isFocused && !isDismissed && !isDisabled && matches.length > 0;
  const highlightedVariable = matches[highlightedIndex];

  useEffect(() => {
    contentRef.current
      ?.querySelector(`[data-nav-index="${highlightedIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

  const syncCursor = (element: HTMLTextAreaElement) => {
    setCursor(element.selectionStart ?? 0);
    setIsDismissed(false);
    setHighlightedIndex(0);
  };

  const insertVariable = (variable: string) => {
    if (variableStart === -1) return;

    const before = value.slice(0, variableStart);
    const trailing = TRAILING_VARIABLE_PATTERN.exec(value.slice(cursor))?.[0] ?? "";
    const after = value.slice(cursor + trailing.length);
    const caret = before.length + variable.length + 2;

    onChange(`${before}${variable}}}${after}`);
    setIsDismissed(true);

    setTimeout(() => {
      const element = inputRef.current;
      if (!element) return;
      element.focus();
      element.setSelectionRange(caret, caret);
      setCursor(caret);
    }, 0);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!isOpen) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedIndex((prev) => {
        const next = event.key === "ArrowDown" ? prev + 1 : prev - 1;
        return (next + matches.length) % matches.length;
      });
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      if (highlightedVariable) insertVariable(highlightedVariable);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setIsDismissed(true);
    }
  };

  return (
    <PopoverPrimitive.Root open={isOpen}>
      <PopoverPrimitive.Trigger asChild>
        <TextArea
          id={id}
          ref={inputRef}
          className="min-h-24 font-mono text-xs"
          value={value}
          placeholder={placeholder}
          isError={isError}
          readOnly={isDisabled}
          disabled={isDisabled}
          onChange={(event) => {
            onChange(event.target.value);
            syncCursor(event.currentTarget);
          }}
          onKeyDown={handleKeyDown}
          onSelect={(event) => setCursor(event.currentTarget.selectionStart ?? 0)}
          onClick={(event) => syncCursor(event.currentTarget)}
          onFocus={(event) => {
            setIsFocused(true);
            setCursor(event.currentTarget.selectionStart ?? 0);
          }}
          onBlur={(event) => {
            if (event.relatedTarget?.getAttribute("aria-label") !== "suggestion-item")
              setIsFocused(false);
          }}
        />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          ref={contentRef}
          align="start"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onMouseDown={(event) => event.preventDefault()}
          className="relative top-2 z-[100] max-h-80 thin-scrollbar overflow-auto rounded-md border border-border bg-popover text-foreground shadow-md"
          style={{ width: "var(--radix-popover-trigger-width)", minWidth: "320px" }}
        >
          <div className="px-2 py-1.5 text-[10px] font-semibold tracking-wider text-muted uppercase">
            Available variables
          </div>
          {matches.map((variable, index) => (
            <button
              key={variable}
              type="button"
              aria-label="suggestion-item"
              data-nav-index={index}
              onClick={() => insertVariable(variable)}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={cn(
                "group flex w-full cursor-pointer items-center justify-between gap-4 px-2 py-2 text-left text-sm transition-colors hover:bg-foreground/10",
                highlightedIndex === index && "bg-foreground/10"
              )}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0">{variable}</span>
                <span className="truncate text-xs text-muted">{descriptions[variable]}</span>
              </div>
              <span className="shrink-0 text-xs text-muted opacity-0 transition-opacity group-hover:opacity-100">
                insert
              </span>
            </button>
          ))}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
};
