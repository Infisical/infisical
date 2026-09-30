import { KeyboardEvent, ReactNode, RefObject, useId, useMemo, useRef, useState } from "react";
import { LockIcon, PlusIcon } from "lucide-react";

import { Popover, PopoverAnchor, PopoverContent } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import {
  findVariableReferenceAtCaret,
  normalizeVariableKey,
  toVariableReference,
  VARIABLE_KEY_RE
} from "@app/helpers/agentVaultVariables";
import { TAgentVaultVariable } from "@app/hooks/api/agentVault/types";

import { useServiceVariables } from "./ServiceVariablesContext";

type TOpenReference = { start: number; query: string };

type TSuggestion =
  | { type: "variable"; variable: TAgentVaultVariable }
  | { type: "create"; key: string; isKeyValid: boolean };

export const useVariableAutocomplete = ({
  inputRef,
  onInsert
}: {
  inputRef: RefObject<HTMLInputElement>;
  /** The whole new value, and where in it the caret belongs. */
  onInsert: (value: string, caret: number) => void;
}) => {
  const { variables, requestVariable } = useServiceVariables();
  const [openReference, setOpenReference] = useState<TOpenReference | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  // Escape closes the list for the reference being typed, not for the field: it opens again at the next {{.
  const dismissedAt = useRef<number | null>(null);
  const listId = useId();

  const suggestions = useMemo((): TSuggestion[] => {
    if (!openReference || !variables) return [];
    const key = normalizeVariableKey(openReference.query);
    const matches = variables
      .filter((variable) => variable.key.includes(key))
      .sort(
        (a, b) =>
          Number(b.key.startsWith(key)) - Number(a.key.startsWith(key)) ||
          a.key.localeCompare(b.key)
      )
      .map((variable) => ({ type: "variable" as const, variable }));

    if (!requestVariable || variables.some((variable) => variable.key === key)) return matches;
    return [...matches, { type: "create", key, isKeyValid: VARIABLE_KEY_RE.test(key) }];
  }, [openReference, variables, requestVariable]);

  const close = () => setOpenReference(null);

  const refresh = () => {
    const input = inputRef.current;
    const caret = input?.selectionStart ?? null;
    const next =
      input && caret !== null && caret === input.selectionEnd
        ? findVariableReferenceAtCaret(input.value, caret)
        : null;

    if (!next) {
      dismissedAt.current = null;
      close();
      return;
    }
    if (next.start === dismissedAt.current) return;
    if (openReference?.start !== next.start || openReference.query !== next.query) {
      setOpenReference({ start: next.start, query: next.query });
      setActiveIndex(0);
    }
  };

  const dismiss = () => {
    dismissedAt.current = openReference?.start ?? null;
    close();
  };

  // Read when a suggestion is chosen, before the list closes. The pick replaces the whole reference the caret is
  // in, closed or not, so no part of the old key is left behind the new one.
  const surroundings = () => {
    const input = inputRef.current;
    if (!input || !openReference) return null;
    const reference = findVariableReferenceAtCaret(
      input.value,
      input.selectionStart ?? input.value.length
    );
    if (!reference) return null;
    return {
      before: input.value.slice(0, reference.start),
      after: input.value.slice(reference.end)
    };
  };

  const choose = async (suggestion: TSuggestion) => {
    const input = inputRef.current;
    const parts = surroundings();
    if (!input || !parts) return;
    const caret = input.selectionStart ?? input.value.length;
    close();

    const insert = (key: string) => {
      const reference = toVariableReference(key);
      onInsert(parts.before + reference + parts.after, parts.before.length + reference.length);
    };

    if (suggestion.type === "variable") {
      insert(suggestion.variable.key);
      return;
    }

    // Settles once the dialog has closed. The field cannot change while it is open, so what surrounded
    // the reference still does, and focus comes back to where the caret was.
    const created = await requestVariable?.(suggestion.key);
    input.focus();
    if (created) insert(created.key);
    else input.setSelectionRange(caret, caret);
  };

  const optionId = (index: number) => `${listId}-option-${index}`;

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!openReference || !suggestions.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      const next = (activeIndex + step + suggestions.length) % suggestions.length;
      setActiveIndex(next);
      document.getElementById(optionId(next))?.scrollIntoView({ block: "nearest" });
      return;
    }
    const active = suggestions[Math.min(activeIndex, suggestions.length - 1)];
    // Tab completes a variable that exists. Opening a dialog is not what a Tab means.
    if (event.key === "Enter" || (event.key === "Tab" && active.type === "variable")) {
      event.preventDefault();
      choose(active);
    }
  };

  return {
    isOpen: Boolean(openReference),
    suggestions,
    activeIndex,
    setActiveIndex,
    listId,
    activeOptionId: openReference && suggestions.length ? optionId(activeIndex) : undefined,
    optionId,
    refresh,
    close,
    dismiss,
    choose,
    onKeyDown
  };
};

type TAutocomplete = ReturnType<typeof useVariableAutocomplete>;

export const VariableSuggestions = ({
  autocomplete,
  children
}: {
  autocomplete: TAutocomplete;
  children: ReactNode;
}) => {
  const { variables } = useServiceVariables();
  const anchorRef = useRef<HTMLDivElement>(null);
  const { isOpen, suggestions, activeIndex, setActiveIndex, listId, optionId, choose, dismiss } =
    autocomplete;
  const variableSuggestions = suggestions.filter((suggestion) => suggestion.type === "variable");
  const createSuggestion = suggestions.find((suggestion) => suggestion.type === "create");

  const renderOption = (suggestion: TSuggestion, index: number) => (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events
    <div
      key={suggestion.type === "variable" ? suggestion.variable.id : "create"}
      id={optionId(index)}
      role="option"
      tabIndex={-1}
      aria-selected={index === activeIndex}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-sm px-2 py-1.5",
        index === activeIndex && "bg-container-hover"
      )}
      onMouseEnter={() => setActiveIndex(index)}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => choose(suggestion)}
    >
      {suggestion.type === "variable" ? (
        <>
          <span className="flex-1 truncate font-mono text-xs">{suggestion.variable.key}</span>
          {suggestion.variable.isSecret ? (
            <LockIcon className="size-3 shrink-0 text-muted" aria-label="Secret" />
          ) : (
            <span className="max-w-32 truncate text-xs text-muted">
              {suggestion.variable.value}
            </span>
          )}
        </>
      ) : (
        <>
          <PlusIcon className="size-3.5 shrink-0 text-muted" />
          {suggestion.isKeyValid ? (
            <span className="min-w-0 truncate text-xs">
              Create <span className="font-mono">{suggestion.key}</span>
            </span>
          ) : (
            <span className="text-xs">Create Variable</span>
          )}
        </>
      )}
    </div>
  );

  return (
    <Popover
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
    >
      <PopoverAnchor asChild>
        <div ref={anchorRef}>{children}</div>
      </PopoverAnchor>
      {/* Unmounted rather than faded out: once it closes nothing is matched, so a fade would show the
          empty message where the list was. */}
      {isOpen && (
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] min-w-56 p-1"
          // Focus stays in the field the whole time: the list is driven from its keyboard.
          onOpenAutoFocus={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => {
            if (anchorRef.current?.contains(event.target as Node)) event.preventDefault();
          }}
        >
          {suggestions.length > 0 ? (
            <div id={listId} role="listbox" aria-label="Variables">
              {variableSuggestions.length > 0 && (
                <div
                  className="max-h-60 overflow-y-auto overscroll-contain"
                  // Rendered outside the sheet, whose scroll lock would otherwise cancel wheel events here.
                  onWheel={(event) => event.stopPropagation()}
                >
                  {variableSuggestions.map(renderOption)}
                </div>
              )}
              {createSuggestion && (
                <>
                  {variableSuggestions.length > 0 && <div className="-mx-1 my-1 h-px bg-border" />}
                  {renderOption(createSuggestion, variableSuggestions.length)}
                </>
              )}
            </div>
          ) : (
            <p className="px-2 py-1.5 text-xs text-muted">
              {variables?.length
                ? "No variable in this bundle matches that name."
                : "This bundle has no variables yet. Add one under Variables."}
            </p>
          )}
        </PopoverContent>
      )}
    </Popover>
  );
};
