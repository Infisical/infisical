import React, { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, TriangleAlert, X } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import {
  eventToNameMap,
  projectToEventsMap,
  userAgentTypeToNameMap
} from "@app/hooks/api/auditLogs/constants";
import { ActorType, EventType, UserAgentType } from "@app/hooks/api/auditLogs/enums";
import {
  ActorSuggestion,
  useAuditLogActorSuggestions
} from "@app/hooks/api/auditLogs/useAuditLogActorSuggestions";
import { ProjectType } from "@app/hooks/api/projects/types";

export interface AppliedFilter {
  property: string;
  value: string;
  label?: string;
}

type Suggestion = { value: string; label: string; actorType?: ActorType };

type FilterProperty = {
  key: string;
  displayLabel?: string;
  hints: string;
  suggestions?: Suggestion[];
};

const FILTER_PROPERTIES: FilterProperty[] = [
  {
    key: "event",
    hints: "add-project-member, remove-project-member, ...",
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
    key: "actor_id",
    hints: "filter by specific user or identity ID"
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
  { key: "secret_path", hints: "e.g. /, /app, /services" },
  { key: "secret_key", hints: "e.g. DATABASE_URL, API_KEY" }
];

const PROJECT_DEPENDENT_KEYS = new Set(["environment", "secret_path", "secret_key"]);

// Filters available to every product. Anything beyond these is product-specific
const GENERIC_FILTER_KEYS = ["event", "actor", "actor_id", "source"];

// Per-product filter keys. Products not listed fall back to the full set (secrets default)
const PRODUCT_FILTER_KEYS: Partial<Record<ProjectType, string[]>> = {
  [ProjectType.PAM]: GENERIC_FILTER_KEYS
};

const getProductFilterProperties = (projectType?: ProjectType) => {
  const keys = projectType ? PRODUCT_FILTER_KEYS[projectType] : undefined;
  const properties = keys
    ? FILTER_PROPERTIES.filter((prop) => keys.includes(prop.key))
    : FILTER_PROPERTIES;

  // Narrow event suggestions to the current product's events (secrets default shows all)
  const projectEvents = projectType ? projectToEventsMap[projectType] : undefined;
  if (!projectEvents) return properties;

  const allowedEvents = new Set<string>(projectEvents);
  return properties.map((prop) =>
    prop.key === "event"
      ? { ...prop, suggestions: prop.suggestions?.filter((s) => allowedEvents.has(s.value)) }
      : prop
  );
};

const getDisplayLabel = (key: string) =>
  FILTER_PROPERTIES.find((prop) => prop.key === key)?.displayLabel || key;

type Props = {
  filters: AppliedFilter[];
  onFiltersChange: (filters: AppliedFilter[]) => void;
  hasProjectContext?: boolean;
  projectId?: string;
  projectType?: ProjectType;
};

export const AuditSearchFilter = ({
  filters,
  onFiltersChange,
  hasProjectContext,
  projectId,
  projectType
}: Props) => {
  const availableProperties = useMemo(() => getProductFilterProperties(projectType), [projectType]);
  const currentActorType = filters.find((f) => f.property === "actor")?.value as
    | ActorType
    | undefined;
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isKeyboardNav = useRef(false);

  const colonIndex = query.indexOf(":");
  const isTypingValue = colonIndex > 0;
  const propertyKey = isTypingValue ? query.slice(0, colonIndex).trim() : null;
  const propertyDef = propertyKey
    ? availableProperties.find((prop) => prop.key === propertyKey)
    : null;
  const typedValue = isTypingValue ? query.slice(colonIndex + 1) : "";
  const isFreetext = propertyKey
    ? availableProperties.some((prop) => prop.key === propertyKey && !prop.suggestions)
    : false;
  const isComposing = isTypingValue && (propertyDef || isFreetext);
  const hasProjectFilter =
    hasProjectContext || filters.some((filter) => filter.property === "project");
  const hasActorId = propertyKey === "actor_id" || filters.some((f) => f.property === "actor_id");
  const { suggestions: actorIdSuggestions } = useAuditLogActorSuggestions(
    currentActorType,
    hasActorId,
    projectId
  );

  const valueSuggestions = useMemo(() => {
    const suggestions = propertyKey === "actor_id" ? actorIdSuggestions : propertyDef?.suggestions;
    if (!suggestions?.length) return [];
    if (!typedValue) return suggestions;
    const lower = typedValue.toLowerCase();
    return suggestions.filter(
      (s) => s.value.toLowerCase().includes(lower) || s.label.toLowerCase().includes(lower)
    );
  }, [propertyKey, propertyDef, actorIdSuggestions, typedValue]);

  const filteredProperties = useMemo(
    () =>
      query
        ? availableProperties.filter((prop) =>
            prop.key.toLowerCase().startsWith(query.toLowerCase())
          )
        : availableProperties,
    [query, availableProperties]
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

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isComposing) inputRef.current?.focus();
  }, [isComposing]);

  useEffect(() => {
    if (highlightedIndex < 0 || !dropdownRef.current) return;
    const item = dropdownRef.current.querySelector(`[data-index="${highlightedIndex}"]`);
    if (item) item.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex]);

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
    if (!propertyKey) return;

    if (propertyKey !== "actor_id" || !suggestion.actorType) {
      addFilter(propertyKey, suggestion.value, suggestion.label);
      return;
    }

    const actorIdFilter: AppliedFilter = {
      property: "actor_id",
      value: suggestion.value,
      label: suggestion.label
    };
    const actorFilter: AppliedFilter = { property: "actor", value: suggestion.actorType };

    const otherFilters = filters.filter((f) => f.property !== "actor" && f.property !== "actor_id");

    onFiltersChange([...otherFilters, actorFilter, actorIdFilter]);
    resetQuery();
    focusInput();
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
        isKeyboardNav.current = true;
        setHighlightedIndex((prev) => (prev < navigableItems.length - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        keyEvent.preventDefault();
        isKeyboardNav.current = true;
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
    isOpen &&
    isTypingValue &&
    valueSuggestions.length > 0 &&
    (propertyKey === "actor_id" || !isFreetext);

  const handleMouseEnter = (index: number) => {
    if (isKeyboardNav.current) return;
    setHighlightedIndex(index);
  };

  const handleMouseMove = () => {
    isKeyboardNav.current = false;
  };

  const dropdownHeadingClass = "px-2 py-1.5 text-xs font-medium text-muted";

  const dropdownRowClass = (active: boolean) =>
    `flex w-full items-center gap-3 rounded-sm px-2 py-1.5 text-sm transition-colors ${
      active ? "bg-foreground/5" : "hover:bg-foreground/5"
    }`;

  const composingInput = (
    <span
      key="composing"
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border py-1 pr-1 pl-1.5 font-mono text-xs"
    >
      <span className="text-muted">{getDisplayLabel(propertyKey || "")}:</span>
      <input
        ref={inputRef}
        type="text"
        className="w-auto bg-transparent font-mono text-xs text-foreground outline-none"
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
        className="ml-0.5 text-muted transition-colors hover:text-foreground"
      >
        <X className="size-2.5" />
      </button>
    </span>
  );

  const actorIdWarning = useMemo<string | null>(() => {
    const actorIdFilter = filters.find((f) => f.property === "actor_id");
    if (!actorIdFilter) return null;
    // Warn when no actor type is set — backend defaults to userId key
    if (!currentActorType) return "An actor type filter is required for accurate results";
    // Warn if a suggestion-picked value doesn't match the current actor type's list
    if (!actorIdFilter.label) return null;
    if (!actorIdSuggestions.some((s) => s.value === actorIdFilter.value)) {
      return "This ID does not match the selected actor type and may not return results";
    }
    return null;
  }, [filters, actorIdSuggestions, currentActorType]);

  const getChipWarning = (filter: AppliedFilter): string | null => {
    if (!hasProjectFilter && PROJECT_DEPENDENT_KEYS.has(filter.property)) {
      return "Requires a project ID filter to take effect";
    }
    if (filter.property === "actor_id" && actorIdWarning) {
      return actorIdWarning;
    }
    return null;
  };

  const renderChip = (filter: AppliedFilter, index: number) => {
    const warning = getChipWarning(filter);

    const chip = (
      <span
        key={`${filter.property}-${filter.value}`}
        className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2.5 py-1 font-mono text-xs ${
          warning ? "border-warning/40 bg-warning/10" : "border-border bg-container"
        }`}
      >
        {warning && <TriangleAlert className="size-2.5 text-warning" />}
        <button
          type="button"
          className="text-foreground transition-colors hover:text-foreground"
          onClick={(clickEvent) => {
            clickEvent.stopPropagation();
            editFilter(index);
          }}
        >
          <span className="text-muted">{getDisplayLabel(filter.property)}:</span>
          {filter.label || filter.value}
        </button>
        <button
          type="button"
          onClick={(clickEvent) => {
            clickEvent.stopPropagation();
            removeFilter(index);
          }}
          className="ml-0.5 text-muted transition-colors hover:text-foreground"
        >
          <X className="size-2.5" />
        </button>
      </span>
    );

    if (warning) {
      return (
        <Tooltip key={`${filter.property}-${filter.value}`}>
          <TooltipTrigger asChild>{chip}</TooltipTrigger>
          <TooltipContent>{warning}</TooltipContent>
        </Tooltip>
      );
    }

    return chip;
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div
        className="flex cursor-text flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2 transition-colors focus-within:border-foreground/30"
        role="button"
        tabIndex={-1}
        onClick={() => inputRef.current?.focus()}
        onKeyDown={(wrapperEvent) => {
          if (wrapperEvent.key === "Enter" || wrapperEvent.key === " ") inputRef.current?.focus();
        }}
      >
        <Search className="size-3.5 shrink-0 text-muted" />

        {filters.map((filter, index) =>
          isComposing && editingIndex === index ? composingInput : renderChip(filter, index)
        )}

        {isComposing && editingIndex === null && composingInput}

        {!isComposing && (
          <input
            ref={inputRef}
            type="text"
            placeholder={filters.length > 0 ? "Add filter..." : "Search audit logs..."}
            className="min-w-[120px] flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
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
        <div className="absolute top-full right-0 left-0 z-50 mt-1 overflow-hidden rounded-md border border-border bg-popover shadow-md">
          <div className="p-1">
            <div className={dropdownHeadingClass}>Add a filter</div>
            {filteredProperties.map((prop, index) => (
              <button
                key={prop.key}
                type="button"
                className={dropdownRowClass(highlightedIndex === index)}
                onClick={() => selectProperty(prop.key)}
                onMouseMove={handleMouseMove}
                onMouseEnter={() => handleMouseEnter(index)}
              >
                <Plus className="size-3 shrink-0 text-muted" />
                <span className="font-mono text-xs font-medium text-foreground">
                  {prop.displayLabel || prop.key}:
                </span>
                <span className="truncate text-xs text-muted">{prop.hints}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center justify-end gap-4 border-t border-border px-3 py-2">
            <span className="text-xs text-muted">
              Press{" "}
              <kbd className="rounded border border-border bg-container px-1.5 py-0.5 font-mono text-[10px] text-foreground">
                enter
              </kbd>{" "}
              to select
            </span>
            <span className="text-xs text-muted">
              <kbd className="rounded border border-border bg-container px-1 py-0.5 font-mono text-[10px] text-foreground">
                ↑
              </kbd>{" "}
              <kbd className="rounded border border-border bg-container px-1 py-0.5 font-mono text-[10px] text-foreground">
                ↓
              </kbd>{" "}
              to navigate
            </span>
          </div>
        </div>
      )}

      {showSuggestionDropdown && (
        <div
          ref={dropdownRef}
          className="absolute top-full right-0 left-0 z-50 mt-1 max-h-64 thin-scrollbar overflow-hidden overflow-y-auto rounded-md border border-border bg-popover shadow-md"
        >
          <div className="p-1">
            {propertyKey === "actor_id" && !currentActorType ? (
              <>
                {(valueSuggestions as ActorSuggestion[]).some(
                  (s) => s.actorType === ActorType.USER
                ) && (
                  <>
                    <div className={dropdownHeadingClass}>Users</div>
                    {(valueSuggestions as ActorSuggestion[]).map((suggestion, index) =>
                      suggestion.actorType === ActorType.USER ? (
                        <button
                          key={`${suggestion.actorType}-${suggestion.value}`}
                          type="button"
                          data-index={index}
                          className={dropdownRowClass(highlightedIndex === index)}
                          onClick={() => selectSuggestion(suggestion)}
                          onMouseMove={handleMouseMove}
                          onMouseEnter={() => handleMouseEnter(index)}
                        >
                          <Plus className="size-3 shrink-0 text-muted" />
                          <span className="font-mono text-xs text-foreground">
                            <span className="font-medium">
                              {getDisplayLabel(propertyKey || "")}:
                            </span>
                            <span className="ml-0.5">{suggestion.label}</span>
                          </span>
                        </button>
                      ) : null
                    )}
                  </>
                )}
                {(valueSuggestions as ActorSuggestion[]).some(
                  (s) => s.actorType === ActorType.IDENTITY
                ) && (
                  <>
                    <div className={dropdownHeadingClass}>Identities</div>
                    {(valueSuggestions as ActorSuggestion[]).map((suggestion, index) =>
                      suggestion.actorType === ActorType.IDENTITY ? (
                        <button
                          key={`${suggestion.actorType}-${suggestion.value}`}
                          type="button"
                          data-index={index}
                          className={dropdownRowClass(highlightedIndex === index)}
                          onClick={() => selectSuggestion(suggestion)}
                          onMouseMove={handleMouseMove}
                          onMouseEnter={() => handleMouseEnter(index)}
                        >
                          <Plus className="size-3 shrink-0 text-muted" />
                          <span className="font-mono text-xs text-foreground">
                            <span className="font-medium">
                              {getDisplayLabel(propertyKey || "")}:
                            </span>
                            <span className="ml-0.5">{suggestion.label}</span>
                          </span>
                        </button>
                      ) : null
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                <div className={dropdownHeadingClass}>Suggestions</div>
                {valueSuggestions.map((suggestion, index) => (
                  <button
                    key={suggestion.value}
                    type="button"
                    data-index={index}
                    className={dropdownRowClass(highlightedIndex === index)}
                    onClick={() => selectSuggestion(suggestion)}
                    onMouseMove={handleMouseMove}
                    onMouseEnter={() => handleMouseEnter(index)}
                  >
                    <Plus className="size-3 shrink-0 text-muted" />
                    <span className="font-mono text-xs text-foreground">
                      <span className="font-medium">{getDisplayLabel(propertyKey || "")}:</span>
                      <span className="ml-0.5">{suggestion.label}</span>
                    </span>
                  </button>
                ))}
              </>
            )}
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
  actor?: string;
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
      case "actor_id":
        result.actor = value;
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
  actor?: string;
}): AppliedFilter[] => {
  const chips: AppliedFilter[] = [];

  filter.eventType?.forEach((eventType) => chips.push({ property: "event", value: eventType }));
  if (filter.userAgentType) chips.push({ property: "source", value: filter.userAgentType });
  if (filter.actorType) chips.push({ property: "actor", value: filter.actorType });
  if (filter.actor) chips.push({ property: "actor_id", value: filter.actor });

  return chips;
};
