import { type KeyboardEvent, type RefCallback, useId, useRef, useState } from "react";
import { Command, CommandGroup, CommandItem, CommandList } from "@infisical/cipher/ui/command";
import { menuRowContent } from "@infisical/cipher/ui/menu-content";
import { Popover, PopoverAnchor, PopoverContent } from "@infisical/cipher/ui/popover";
import { Textarea } from "@infisical/cipher/ui/textarea";

const OPEN_VARIABLE_PATTERN = /\{\{([a-zA-Z0-9_]*)$/;

const TRAILING_VARIABLE_PATTERN = /^[a-zA-Z0-9_]*(\}\})?/;

export function HostCommandInput({
  inputRef: externalRef,
  name,
  value,
  onChange,
  onBlur,
  variables,
  descriptions,
  placeholder,
  invalid,
  disabled
}: {
  inputRef?: RefCallback<HTMLTextAreaElement>;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  variables: readonly string[];
  descriptions: Record<string, string>;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const listId = useId();
  const [cursor, setCursor] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [highlighted, setHighlighted] = useState("");

  const query = OPEN_VARIABLE_PATTERN.exec(value.slice(0, cursor))?.[1] ?? null;
  const variableStart = query === null ? -1 : cursor - query.length;
  const matches =
    query === null
      ? []
      : variables.filter((variable) => variable.toLowerCase().startsWith(query.toLowerCase()));
  const isOpen = isFocused && !isDismissed && !disabled && matches.length > 0;
  const active =
    matches.find((variable) => variable.toLowerCase() === highlighted.toLowerCase()) ?? matches[0];

  const setRefs = (element: HTMLTextAreaElement | null) => {
    inputRef.current = element;
    externalRef?.(element);
  };

  const syncCursor = (element: HTMLTextAreaElement) => {
    setCursor(element.selectionStart ?? 0);
    setIsDismissed(false);
    setHighlighted("");
  };

  const insertVariable = (variable: string) => {
    if (variableStart === -1) return;
    const before = value.slice(0, variableStart);
    const trailing = TRAILING_VARIABLE_PATTERN.exec(value.slice(cursor))?.[0] ?? "";
    const after = value.slice(cursor + trailing.length);
    const caret = before.length + variable.length + 2;
    onChange(`${before}${variable}}}${after}`);
    setIsDismissed(true);
    requestAnimationFrame(() => {
      const element = inputRef.current;
      if (!element) return;
      element.focus();
      element.setSelectionRange(caret, caret);
      setCursor(caret);
    });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!isOpen || event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      const index = matches.indexOf(active);
      setHighlighted(matches[(index + step + matches.length) % matches.length]);
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      if (active) insertVariable(active);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setIsDismissed(true);
    }
  };

  return (
    <Popover
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) setIsDismissed(true);
      }}
    >
      <PopoverAnchor asChild>
        <Textarea
          ref={setRefs}
          name={name}
          mono
          rows={4}
          value={value}
          placeholder={placeholder}
          readOnly={disabled}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={isOpen}
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
          onBlur={() => {
            setIsFocused(false);
            onBlur?.();
          }}
        />
      </PopoverAnchor>
      <PopoverContent
        surface="menu"
        align="start"
        style={{ width: "var(--radix-popover-trigger-width)" }}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onMouseDown={(event) => event.preventDefault()}
      >
        <Command shouldFilter={false} value={active ?? ""} onValueChange={setHighlighted}>
          <CommandList id={listId}>
            <CommandGroup heading="Available variables">
              {matches.map((variable) => (
                <CommandItem
                  key={variable}
                  value={variable}
                  onSelect={() => insertVariable(variable)}
                >
                  {menuRowContent(variable, descriptions[variable])}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
