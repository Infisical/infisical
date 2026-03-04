import React, { useEffect, useMemo, useRef, useState } from "react";
import { faClose, faMagnifyingGlass, faPlus, faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Tooltip } from "@app/components/v2";
import { eventToNameMap, userAgentTypeToNameMap } from "@app/hooks/api/auditLogs/constants";
import { ActorType, EventType, UserAgentType } from "@app/hooks/api/auditLogs/enums";

export interface AppliedFilter {
  property: string;
  value: string;
  label?: string;
}

type Suggestion = { value: string; label: string };

type FilterProperty = {
  key: string;
  displayLabel?: string;
  hints: string;
  suggestions?: Suggestion[];
};

const FILTER_PROPERTIES: FilterProperty[] = [
  {
    key: "event",
    hints: "get-secret, get-secrets, create-secret, ...",
    suggestions: Object.entries(eventToNameMap).map(([value, label]) => ({
      value,
      label: `${value} (${label})`
    }))
  },
  {
    key: "actor",
    hints: "user, identity, unknownUser, ...",
    suggestions: Object.values(ActorType).map((val) => ({ value: val, label: val }))
  },
  {
    key: "source",
    hints: "web, cli, k8-operator, terraform, ...",
    suggestions: Object.entries(userAgentTypeToNameMap).map(([value, label]) => ({
      value,
      label: `${value} (${label})`
    }))
  },
  { key: "project", hints: "project ID" },
  { key: "environment", hints: "e.g. production, staging, dev" },
  { key: "secret_path", displayLabel: "secret path", hints: "e.g. /, /app, /services" },
  { key: "secret_key", displayLabel: "secret key", hints: "e.g. DATABASE_URL, API_KEY" }
];

const PROJECT_DEPENDENT_KEYS = new Set(["environment", "secret_path", "secret_key"]);

const getDisplayLabel = (key: string) =>
  FILTER_PROPERTIES.find((prop) => prop.key === key)?.displayLabel || key;

const isFreetextKey = (key: string) =>
  !FILTER_PROPERTIES.find((prop) => prop.key === key)?.suggestions;

type Props = {
  filters: AppliedFilter[];
  onFiltersChange: (filters: AppliedFilter[]) => void;
  hasProjectContext?: boolean;
};

export const AuditSearchFilter = ({ filters, onFiltersChange, hasProjectContext }: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const colonIndex = query.indexOf(":");
  const isTypingValue = colonIndex > 0;
  const propertyKey = isTypingValue ? query.slice(0, colonIndex).trim() : null;
  const propertyDef = propertyKey
    ? FILTER_PROPERTIES.find((prop) => prop.key === propertyKey)
    : null;
  const typedValue = isTypingValue ? query.slice(colonIndex + 1) : "";
  const isFreetext = propertyKey ? isFreetextKey(propertyKey) : false;
  const isComposing = isTypingValue && (propertyDef || isFreetext);
  const hasProjectFilter =
    hasProjectContext || filters.some((filter) => filter.property === "project");

  const valueSuggestions = useMemo(() => {
    if (!propertyDef?.suggestions) return [];
    if (!typedValue) return propertyDef.suggestions;
    const lower = typedValue.toLowerCase();
    return propertyDef.suggestions.filter(
      (suggestion) =>
        suggestion.value.toLowerCase().includes(lower) ||
        suggestion.label.toLowerCase().includes(lower)
    );
  }, [propertyDef, typedValue]);

  const filteredProperties = useMemo(
    () =>
      query
        ? FILTER_PROPERTIES.filter((prop) => prop.key.toLowerCase().startsWith(query.toLowerCase()))
        : FILTER_PROPERTIES,
    [query]
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isComposing) inputRef.current?.focus();
  }, [isComposing]);

  const focusInput = () => setTimeout(() => inputRef.current?.focus(), 0);

  const resetQuery = () => {
    setQuery("");
    setIsOpen(false);
    setHighlightedIndex(-1);
    setEditingIndex(null);
  };

  const addFilter = (property: string, value: string, label?: string) => {
    const newFilter = { property, value, label };
    let updated: AppliedFilter[];

    if (editingIndex !== null) {
      updated = filters.map((filter, index) => (index === editingIndex ? newFilter : filter));
    } else if (property === "event") {
      if (filters.some((filter) => filter.property === property && filter.value === value)) {
        resetQuery();
        focusInput();
        return;
      }
      updated = [...filters, newFilter];
    } else {
      updated = [...filters.filter((filter) => filter.property !== property), newFilter];
    }

    onFiltersChange(updated);
    resetQuery();
    focusInput();
  };

  const removeFilter = (index: number) => {
    onFiltersChange(filters.filter((_, filterIndex) => filterIndex !== index));
  };

  const editFilter = (index: number) => {
    const target = filters[index];
    setEditingIndex(index);
    setQuery(`${target.property}:${target.value}`);
    setIsOpen(true);
    setHighlightedIndex(-1);
    focusInput();
  };

  const handleSubmit = () => {
    const value = typedValue.trim();
    if (!value || !propertyKey || (!isFreetext && !propertyDef)) return;
    addFilter(propertyKey, value);
  };

  const selectProperty = (key: string) => {
    setQuery(`${key}:`);
    setHighlightedIndex(-1);
    setIsOpen(true);
    inputRef.current?.focus();
  };

  const selectSuggestion = (suggestion: Suggestion) => {
    if (propertyKey) addFilter(propertyKey, suggestion.value, suggestion.label);
  };

  const navigableItems = isTypingValue
    ? valueSuggestions
    : filteredProperties.map((prop) => ({ value: prop.key, label: prop.key }));

  const handleKeyDown = (keyEvent: React.KeyboardEvent) => {
    switch (keyEvent.key) {
      case "Enter":
        keyEvent.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < navigableItems.length) {
          if (isTypingValue) selectSuggestion(navigableItems[highlightedIndex]);
          else selectProperty(navigableItems[highlightedIndex].value);
        } else {
          handleSubmit();
        }
        break;
      case "ArrowDown":
        keyEvent.preventDefault();
        setHighlightedIndex((prev) => (prev < navigableItems.length - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        keyEvent.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : navigableItems.length - 1));
        break;
      case "Escape":
        setIsOpen(false);
        setHighlightedIndex(-1);
        break;
      case "Backspace":
        if (query === "" && filters.length > 0) removeFilter(filters.length - 1);
        break;
      default:
        break;
    }
  };

  const showPropertyDropdown = isOpen && !isTypingValue;
  const showSuggestionDropdown =
    isOpen && isTypingValue && !isFreetext && valueSuggestions.length > 0;

  const dropdownRowClass = (active: boolean) =>
    `flex w-full items-center gap-3 px-3 py-1.5 text-sm transition-colors ${
      active ? "bg-mineshaft-600" : "hover:bg-mineshaft-700"
    }`;

  const composingInput = (
    <span
      key="composing"
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-mineshaft-400 py-1 pr-1 pl-1.5 font-mono text-xs"
    >
      <span className="text-mineshaft-400">{getDisplayLabel(propertyKey || "")}:</span>
      <input
        ref={inputRef}
        type="text"
        className="w-auto bg-transparent font-mono text-xs text-bunker-200 outline-none"
        style={{ width: `${Math.max(typedValue.length, 1)}ch` }}
        value={typedValue}
        onChange={(inputEvent) => {
          setQuery(`${propertyKey}:${inputEvent.target.value}`);
          setIsOpen(true);
          setHighlightedIndex(-1);
        }}
        onKeyDown={handleKeyDown}
      />
      <button
        type="button"
        onClick={(clickEvent) => {
          clickEvent.stopPropagation();
          resetQuery();
        }}
        className="ml-0.5 text-mineshaft-400 transition-colors hover:text-mineshaft-200"
      >
        <FontAwesomeIcon icon={faClose} className="h-2.5 w-2.5" />
      </button>
    </span>
  );

  const renderChip = (filter: AppliedFilter, index: number) => {
    const isOrphaned = !hasProjectFilter && PROJECT_DEPENDENT_KEYS.has(filter.property);

    const chip = (
      <span
        key={`${filter.property}-${filter.value}`}
        className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1 font-mono text-xs ${
          isOrphaned
            ? "border-yellow-700/60 bg-yellow-900/20"
            : "border-mineshaft-500 bg-mineshaft-700"
        }`}
      >
        {isOrphaned && <FontAwesomeIcon icon={faWarning} className="h-2.5 w-2.5 text-yellow-600" />}
        <button
          type="button"
          className="text-bunker-200 transition-colors hover:text-mineshaft-100"
          onClick={(clickEvent) => {
            clickEvent.stopPropagation();
            editFilter(index);
          }}
        >
          <span className="text-mineshaft-400">{getDisplayLabel(filter.property)}:</span>
          {filter.label || filter.value}
        </button>
        <button
          type="button"
          onClick={(clickEvent) => {
            clickEvent.stopPropagation();
            removeFilter(index);
          }}
          className="ml-0.5 text-mineshaft-400 transition-colors hover:text-mineshaft-200"
        >
          <FontAwesomeIcon icon={faClose} className="h-2.5 w-2.5" />
        </button>
      </span>
    );

    if (isOrphaned) {
      return (
        <Tooltip
          key={`${filter.property}-${filter.value}`}
          content="Requires a project ID filter to take effect"
          size="sm"
        >
          {chip}
        </Tooltip>
      );
    }

    return chip;
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        className="flex cursor-text flex-wrap items-center gap-2 rounded-md border border-mineshaft-500 bg-mineshaft-900 px-3 py-2 transition-colors focus-within:border-mineshaft-400"
        role="button"
        tabIndex={-1}
        onClick={() => inputRef.current?.focus()}
        onKeyDown={(wrapperEvent) => {
          if (wrapperEvent.key === "Enter" || wrapperEvent.key === " ") inputRef.current?.focus();
        }}
      >
        <FontAwesomeIcon
          icon={faMagnifyingGlass}
          className="h-3.5 w-3.5 shrink-0 text-mineshaft-400"
        />

        {filters.map((filter, index) =>
          isComposing && editingIndex === index ? composingInput : renderChip(filter, index)
        )}

        {isComposing && editingIndex === null && composingInput}

        {!isComposing && (
          <input
            ref={inputRef}
            type="text"
            placeholder={filters.length > 0 ? "Add filter..." : "Search audit logs..."}
            className="min-w-[120px] flex-1 bg-transparent text-sm text-bunker-200 outline-none placeholder:text-mineshaft-400"
            value={query}
            onChange={(inputEvent) => {
              setQuery(inputEvent.target.value);
              setIsOpen(true);
              setHighlightedIndex(-1);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
          />
        )}
      </div>

      {showPropertyDropdown && (
        <div className="absolute top-full right-0 left-0 z-50 mt-1 overflow-hidden rounded-md border border-mineshaft-600 bg-mineshaft-800 shadow-lg">
          <div className="py-2">
            <div className="px-3 py-1.5 text-xs font-medium text-mineshaft-400">Add a filter</div>
            {filteredProperties.map((prop, index) => (
              <button
                key={prop.key}
                type="button"
                className={dropdownRowClass(highlightedIndex === index)}
                onClick={() => selectProperty(prop.key)}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                <FontAwesomeIcon icon={faPlus} className="h-3 w-3 shrink-0 text-mineshaft-400" />
                <span className="font-mono text-xs font-medium text-bunker-200">
                  {prop.displayLabel || prop.key}:
                </span>
                <span className="truncate text-xs text-mineshaft-400">{prop.hints}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center justify-end gap-4 border-t border-mineshaft-600 px-3 py-2">
            <span className="text-xs text-mineshaft-400">
              Press{" "}
              <kbd className="rounded border border-mineshaft-500 bg-mineshaft-700 px-1.5 py-0.5 font-mono text-[10px] text-bunker-200">
                enter
              </kbd>{" "}
              to select
            </span>
            <span className="text-xs text-mineshaft-400">
              <kbd className="rounded border border-mineshaft-500 bg-mineshaft-700 px-1 py-0.5 font-mono text-[10px] text-bunker-200">
                ↑
              </kbd>{" "}
              <kbd className="rounded border border-mineshaft-500 bg-mineshaft-700 px-1 py-0.5 font-mono text-[10px] text-bunker-200">
                ↓
              </kbd>{" "}
              to navigate
            </span>
          </div>
        </div>
      )}

      {showSuggestionDropdown && (
        <div className="absolute top-full right-0 left-0 z-50 mt-1 max-h-64 thin-scrollbar overflow-hidden overflow-y-auto rounded-md border border-mineshaft-600 bg-mineshaft-800 shadow-lg">
          <div className="py-2">
            <div className="px-3 py-1.5 text-xs font-medium text-mineshaft-400">Suggestions</div>
            {valueSuggestions.map((suggestion, index) => (
              <button
                key={suggestion.value}
                type="button"
                className={dropdownRowClass(highlightedIndex === index)}
                onClick={() => selectSuggestion(suggestion)}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                <FontAwesomeIcon icon={faPlus} className="h-3 w-3 shrink-0 text-mineshaft-400" />
                <span className="font-mono text-xs text-bunker-200">
                  <span className="font-medium">{getDisplayLabel(propertyKey || "")}:</span>
                  <span className="ml-0.5">{suggestion.label}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const appliedFiltersToLogFilter = (
  filters: AppliedFilter[]
): {
  eventType: EventType[];
  userAgentType?: UserAgentType;
  actorType?: ActorType;
  projectId?: string;
  environment?: string;
  secretPath?: string;
  secretKey?: string;
} => {
  const result: ReturnType<typeof appliedFiltersToLogFilter> = { eventType: [] };

  filters.forEach(({ property, value }) => {
    switch (property) {
      case "event":
        if (Object.values(EventType).includes(value as EventType)) {
          result.eventType.push(value as EventType);
        }
        break;
      case "source":
        if (Object.values(UserAgentType).includes(value as UserAgentType)) {
          result.userAgentType = value as UserAgentType;
        }
        break;
      case "actor":
        if (Object.values(ActorType).includes(value as ActorType)) {
          result.actorType = value as ActorType;
        }
        break;
      case "project":
        result.projectId = value;
        break;
      case "environment":
        result.environment = value;
        break;
      case "secret_path":
        result.secretPath = value;
        break;
      case "secret_key":
        result.secretKey = value;
        break;
      default:
        break;
    }
  });

  return result;
};

export const logFilterToAppliedFilters = (filter: {
  eventType?: EventType[];
  userAgentType?: UserAgentType;
  actorType?: ActorType;
}): AppliedFilter[] => {
  const chips: AppliedFilter[] = [];

  filter.eventType?.forEach((eventType) => chips.push({ property: "event", value: eventType }));
  if (filter.userAgentType) chips.push({ property: "source", value: filter.userAgentType });
  if (filter.actorType) chips.push({ property: "actor", value: filter.actorType });

  return chips;
};
