import React, { useEffect, useRef, useState } from "react";
import { BracesIcon, ChevronDownIcon, InfoIcon, SearchIcon, XIcon, ZapIcon } from "lucide-react";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { SecretMetadataSearchOperator } from "@app/hooks/api/dashboard/types";

export type MetadataSearchCondition = {
  id: string;
  key: string;
  value: string;
  operator: SecretMetadataSearchOperator;
};

export type MetadataMatchType = "all" | "any";

// Selectable comparison operators. Only "is" exists today; adding a new operator here surfaces it
// in the dropdown automatically.
const METADATA_OPERATORS: { value: SecretMetadataSearchOperator; label: string }[] = [
  { value: SecretMetadataSearchOperator.Is, label: "is" }
];

const DEFAULT_OPERATOR = METADATA_OPERATORS[0].value;

const getOperatorLabel = (operator: SecretMetadataSearchOperator) =>
  METADATA_OPERATORS.find((op) => op.value === operator)?.label ?? operator;

type Props = {
  conditions: MetadataSearchCondition[];
  match: MetadataMatchType;
  matchingCount: number;
  isPending: boolean;
  hasActiveConditions: boolean;
  onChangeMatch: (match: MetadataMatchType) => void;
  onAddCondition: (key: string, value: string, operator: SecretMetadataSearchOperator) => void;
  onEditCondition: (
    id: string,
    key: string,
    value: string,
    operator: SecretMetadataSearchOperator
  ) => void;
  onRemoveCondition: (id: string) => void;
  onClear: () => void;
  onClose: () => void;
};

export const SecretMetadataSearchInput = ({
  conditions,
  match,
  matchingCount,
  isPending,
  hasActiveConditions,
  onChangeMatch,
  onAddCondition,
  onEditCondition,
  onRemoveCondition,
  onClear,
  onClose
}: Props) => {
  // raw "key:value" text for the chip being composed; metadata keys are free-form so we just
  // split on the first colon rather than matching against a fixed property list.
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [composingOperator, setComposingOperator] =
    useState<SecretMetadataSearchOperator>(DEFAULT_OPERATOR);
  const inputRef = useRef<HTMLInputElement>(null);

  const colonIndex = query.indexOf(":");
  const isComposing = colonIndex > 0;
  const propertyKey = isComposing ? query.slice(0, colonIndex).trim() : "";
  const typedValue = isComposing ? query.slice(colonIndex + 1) : "";

  const focusInput = () => {
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const resetQuery = () => {
    setQuery("");
    setEditingId(null);
    setComposingOperator(DEFAULT_OPERATOR);
  };

  // refocus the input when swapping between the free-text field and the composing pill
  useEffect(() => {
    if (isComposing) inputRef.current?.focus();
  }, [isComposing]);

  const commit = () => {
    const key = propertyKey.trim();
    const value = typedValue.trim();
    if (!key || !value) return;

    if (editingId !== null) {
      onEditCondition(editingId, key, value, composingOperator);
    } else {
      onAddCondition(key, value, composingOperator);
    }
    resetQuery();
    focusInput();
  };

  const editCondition = (condition: MetadataSearchCondition) => {
    setEditingId(condition.id);
    setComposingOperator(condition.operator);
    setQuery(`${condition.key}:${condition.value}`);
    focusInput();
  };

  const handleKeyDown = (keyEvent: React.KeyboardEvent) => {
    switch (keyEvent.key) {
      case "Enter":
        keyEvent.preventDefault();
        commit();
        break;
      case "Escape":
        resetQuery();
        break;
      case "Backspace":
        if (query === "" && conditions.length > 0) {
          onRemoveCondition(conditions[conditions.length - 1].id);
        }
        break;
      default:
        break;
    }
  };

  const operatorDropdown = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Select operator"
          onClick={(clickEvent) => clickEvent.stopPropagation()}
          className="inline-flex items-center gap-0.5 rounded bg-neutral/15 px-1.5 py-0.5 text-muted transition-colors hover:bg-neutral/25 hover:text-foreground"
        >
          {getOperatorLabel(composingOperator)}
          <ChevronDownIcon className="size-2.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[6rem]">
        {METADATA_OPERATORS.map((op) => (
          <DropdownMenuItem
            key={op.value}
            onSelect={() => {
              setComposingOperator(op.value);
              focusInput();
            }}
          >
            {op.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const composingInput = (
    <span
      key="composing"
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border py-1 pr-1 pl-1.5 font-mono text-xs"
    >
      <span className="text-muted">{propertyKey}</span>
      {operatorDropdown}
      <input
        ref={inputRef}
        type="text"
        className="w-auto bg-transparent font-mono text-xs text-foreground outline-none"
        style={{ width: `${Math.max(typedValue.length, 1)}ch` }}
        value={typedValue}
        onChange={(inputEvent) => setQuery(`${propertyKey}:${inputEvent.target.value}`)}
        onKeyDown={handleKeyDown}
      />
      <button
        type="button"
        aria-label="Cancel condition"
        onClick={(clickEvent) => {
          clickEvent.stopPropagation();
          resetQuery();
        }}
        className="ml-0.5 text-muted transition-colors hover:text-foreground"
      >
        <XIcon className="size-2.5" />
      </button>
    </span>
  );

  const renderChip = (condition: MetadataSearchCondition) => (
    <span
      key={condition.id}
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border bg-container px-2.5 py-1 font-mono text-xs"
    >
      <button
        type="button"
        className="text-foreground transition-colors hover:text-foreground"
        onClick={(clickEvent) => {
          clickEvent.stopPropagation();
          editCondition(condition);
        }}
      >
        <span className="text-muted">{`${condition.key} ${getOperatorLabel(condition.operator)} `}</span>
        {condition.value}
      </button>
      <button
        type="button"
        aria-label="Remove condition"
        onClick={(clickEvent) => {
          clickEvent.stopPropagation();
          onRemoveCondition(condition.id);
        }}
        className="ml-0.5 text-muted transition-colors hover:text-foreground"
      >
        <XIcon className="size-2.5" />
      </button>
    </span>
  );

  return (
    <div className="mb-5 rounded-lg border border-border bg-popover">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <BracesIcon className="size-4 text-muted" />
          <span className="font-medium">Filter by metadata</span>
          <div className="ml-auto flex items-center gap-2">
            <div className="inline-flex rounded-md border border-border p-0.5">
              {(["all", "any"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => onChangeMatch(option)}
                  className={cn(
                    "h-6 rounded px-3 text-xs font-semibold tracking-wide transition-colors",
                    match === option
                      ? "bg-project/15 text-project"
                      : "text-muted hover:text-foreground"
                  )}
                >
                  {option.toUpperCase()}
                </button>
              ))}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-default text-muted">
                  <InfoIcon className="size-3.5" />
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <span className="font-semibold text-project">ALL</span> returns secrets matching
                every condition (AND). <span className="font-semibold text-project">ANY</span>{" "}
                returns secrets matching at least one condition (OR).
              </TooltipContent>
            </Tooltip>
            <IconButton
              variant="ghost"
              size="xs"
              aria-label="Close metadata filter"
              onClick={onClose}
            >
              <XIcon />
            </IconButton>
          </div>
        </div>
        <p className="mt-1 pl-7 text-xs text-muted">
          Type <code> key : value </code> and press Enter to add a filter, e.g. env is production.
        </p>
      </div>

      <div className="p-4">
        <div
          className="flex cursor-text flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2 transition-colors focus-within:border-foreground/30"
          role="button"
          tabIndex={-1}
          onClick={() => inputRef.current?.focus()}
          onKeyDown={(wrapperEvent) => {
            if (wrapperEvent.key === "Enter" || wrapperEvent.key === " ") {
              inputRef.current?.focus();
            }
          }}
        >
          <SearchIcon className="size-3.5 shrink-0 text-muted" />

          {conditions.map((condition) =>
            isComposing && editingId === condition.id ? composingInput : renderChip(condition)
          )}

          {isComposing && editingId === null && composingInput}

          {!isComposing && (
            <input
              ref={inputRef}
              type="text"
              placeholder="Add filter..."
              className="min-w-[160px] flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
              value={query}
              onChange={(inputEvent) => setQuery(inputEvent.target.value)}
              onKeyDown={handleKeyDown}
            />
          )}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border px-4 py-3">
        <span className="flex items-center gap-2 text-sm text-muted">
          <ZapIcon className="size-3.5 text-project" />
          {hasActiveConditions ? (
            <span>
              <span className="font-semibold text-foreground">
                {isPending ? "…" : matchingCount}
              </span>{" "}
              matching {matchingCount === 1 && !isPending ? "secret" : "secrets"}
            </span>
          ) : (
            <span>Add a condition to search</span>
          )}
        </span>
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear
        </Button>
      </div>
    </div>
  );
};
