import * as React from "react";
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { CheckIcon, ChevronDownIcon, Loader2Icon, PlusIcon, XIcon } from "lucide-react";

import { cn } from "../../utils";
import { useScrollEdges } from "../../utils/useScrollEdges";
import { getComboboxInputAriaLabel } from "./combobox-accessibility";
import { type ComboboxCreationContext, getComboboxCreationInput } from "./combobox-creation";
import { mergeComboboxItems } from "./combobox-items";

import "../../utils/ScrollEdgeFade.css";

type ComboboxRenderOptionState = {
  isSelected: boolean;
};

type ComboboxCreationConfig<TOption> = {
  /**
   * Owns domain-option construction, persistence, and controlled options/value
   * updates. Return the persistence promise so the combobox can retain the query
   * on failure and clear it only after success.
   */
  onCreate: (inputValue: string) => void | Promise<void>;
  isValid?: (inputValue: string, context: ComboboxCreationContext<TOption>) => boolean;
  isDuplicate?: (inputValue: string, option: TOption) => boolean;
  formatLabel?: (inputValue: string) => React.ReactNode;
  formatPendingLabel?: (inputValue: string) => React.ReactNode;
  formatError?: (error: unknown, inputValue: string) => React.ReactNode;
  isDisabled?: boolean;
  isPending?: boolean;
};

type ComboboxSharedProps<TOption> = {
  options?: readonly TOption[];
  getOptionValue: (option: TOption) => string;
  getOptionLabel: (option: TOption) => string;
  getOptionKeywords?: (option: TOption) => readonly string[];
  getOptionGroup?: (option: TOption) => string;
  isOptionDisabled?: (option: TOption) => boolean;
  renderOption?: (option: TOption, state: ComboboxRenderOptionState) => React.ReactNode;
  renderOptionIndicator?: (option: TOption, state: ComboboxRenderOptionState) => React.ReactNode;
  renderValue?: (option: TOption) => React.ReactNode;
  clearAriaLabel?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  searchAriaLabel?: string;
  emptyMessage?: React.ReactNode | ((inputValue: string) => React.ReactNode);
  loadingMessage?: React.ReactNode;
  isDisabled?: boolean;
  isLoading?: boolean;
  isError?: boolean;
  modal?: boolean;
  portalContainer?: HTMLElement | React.RefObject<HTMLElement | null> | null;
  contentClassName?: string;
  onInputValueChange?: (inputValue: string) => void;
  shouldFilter?: boolean;
  /** Keep selected values in the option list even when absent from the latest results. */
  includeMissingSelectedOptions?: boolean;
  creation?: ComboboxCreationConfig<TOption>;
};

type ComboboxSingleProps<TOption> = ComboboxSharedProps<TOption> &
  Omit<
    React.ComponentPropsWithoutRef<"input">,
    "children" | "disabled" | "multiple" | "onChange" | "type" | "value"
  > & {
    multiple?: false;
    value?: TOption | null;
    onValueChange: (option: TOption) => void;
    onClear?: () => void;
  };

type ComboboxMultipleProps<TOption> = ComboboxSharedProps<TOption> &
  Omit<
    React.ComponentPropsWithoutRef<"input">,
    "children" | "disabled" | "multiple" | "onChange" | "type" | "value"
  > & {
    multiple: true;
    singleLine?: boolean;
    isSelectAll?: boolean;
    value?: readonly TOption[];
    onValueChange: (options: TOption[]) => void;
    onClear?: () => void;
  };

type ComboboxProps<TOption> = ComboboxSingleProps<TOption> | ComboboxMultipleProps<TOption>;

const SINGLE_LIST_MAX_HEIGHT = "min(18.75rem, var(--available-height, 50dvh))";
const MULTIPLE_LIST_MAX_HEIGHT = "min(18.75rem, var(--available-height, 50dvh))";

// Geometry and typography shared by every popup row, so the select-all action cannot
// drift from the option rows it sits above.
const COMBOBOX_ROW_CLASS =
  "flex min-h-8 cursor-default items-center gap-2 rounded-sm py-1.5 text-sm text-foreground outline-hidden select-none";

const normalizeSearchText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();

const preventComboboxFormSubmit = (event: React.KeyboardEvent<HTMLInputElement>) => {
  if (event.key === "Enter") event.preventDefault();
};

const useComboboxItems = <TOption,>(
  options: readonly TOption[],
  selectedOptions: readonly TOption[],
  getOptionValue: (option: TOption) => string,
  includeMissingSelectedOptions: boolean
) =>
  React.useMemo(
    () =>
      mergeComboboxItems(options, selectedOptions, getOptionValue, includeMissingSelectedOptions),
    [getOptionValue, includeMissingSelectedOptions, options, selectedOptions]
  );

type ComboboxOptionItem<TOption> = {
  type: "option";
  option: TOption;
};

type ComboboxCreateItem = {
  type: "create";
  inputValue: string;
};

type ComboboxItem<TOption> = ComboboxOptionItem<TOption> | ComboboxCreateItem;

type ComboboxGroup<TOption> = {
  type: "group";
  value: string;
  items: ComboboxItem<TOption>[];
  isCreationGroup?: boolean;
};

const usePrimitiveComboboxItems = <TOption,>(
  items: readonly TOption[],
  getOptionValue: (option: TOption) => string,
  getOptionGroup?: (option: TOption) => string
) =>
  React.useMemo(() => {
    // Base UI treats any object with an `items` property as a group. Wrapping every
    // consumer option keeps provider-specific fields opaque to the primitive and
    // reserves the grouped shape for groups created explicitly below.
    const flatItems: ComboboxOptionItem<TOption>[] = items.map((option) => ({
      type: "option",
      option
    }));
    const itemsByValue = new Map(
      flatItems.map((item) => [getOptionValue(item.option), item] as const)
    );

    if (!getOptionGroup) return { itemsByValue, rootItems: flatItems };

    const groupedItems = new Map<string, ComboboxOptionItem<TOption>[]>();
    flatItems.forEach((item) => {
      const group = getOptionGroup(item.option);
      const groupItems = groupedItems.get(group);
      if (groupItems) groupItems.push(item);
      else groupedItems.set(group, [item]);
    });

    return {
      itemsByValue,
      rootItems: Array.from(groupedItems, ([value, groupItems]) => ({
        type: "group" as const,
        value,
        items: groupItems
      }))
    };
  }, [getOptionGroup, getOptionValue, items]);

type ComboboxListProps<TOption> = Omit<
  Pick<
    ComboboxSharedProps<TOption>,
    | "emptyMessage"
    | "getOptionLabel"
    | "getOptionGroup"
    | "getOptionValue"
    | "isLoading"
    | "isOptionDisabled"
    | "loadingMessage"
    | "creation"
    | "renderOption"
    | "renderOptionIndicator"
  >,
  "emptyMessage"
> & {
  emptyMessage?: React.ReactNode;
  ariaLabel: string;
  isEmpty: boolean;
  selectedValues: ReadonlySet<string>;
  maxHeight: string;
  creationError: { error: unknown; inputValue: string } | null;
  isCreationPending: boolean;
};

const ComboboxList = <TOption,>({
  emptyMessage,
  getOptionLabel,
  getOptionGroup,
  getOptionValue,
  isLoading,
  isOptionDisabled,
  loadingMessage,
  creation,
  renderOption,
  renderOptionIndicator,
  ariaLabel,
  isEmpty,
  selectedValues,
  maxHeight,
  creationError,
  isCreationPending
}: ComboboxListProps<TOption>) => {
  const renderItem = (item: ComboboxItem<TOption>) => {
    if (item.type === "create") {
      const hasCreationError = creationError?.inputValue === item.inputValue;
      const error = hasCreationError ? creationError.error : undefined;

      return (
        <ComboboxPrimitive.Item
          key={`create:${item.inputValue}`}
          value={item}
          disabled={creation?.isDisabled || isCreationPending}
          className={cn(
            COMBOBOX_ROW_CLASS,
            "px-2 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-65 data-[highlighted]:bg-foreground/5 data-[highlighted]:text-foreground"
          )}
        >
          {isCreationPending ? (
            <Loader2Icon className="size-4 shrink-0 animate-spin text-accent" aria-hidden="true" />
          ) : (
            <PlusIcon className="size-4 shrink-0 text-accent" aria-hidden="true" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate">
              {isCreationPending
                ? (creation?.formatPendingLabel?.(item.inputValue) ??
                  `Creating "${item.inputValue}"...`)
                : (creation?.formatLabel?.(item.inputValue) ?? `Create "${item.inputValue}"`)}
            </span>
            {hasCreationError ? (
              <span role="alert" className="block text-xs whitespace-normal text-danger">
                {creation?.formatError?.(error, item.inputValue) ??
                  `Could not create "${item.inputValue}". Try again.`}
              </span>
            ) : null}
          </span>
        </ComboboxPrimitive.Item>
      );
    }

    const { option } = item;
    const optionValue = getOptionValue(option);
    const isSelected = selectedValues.has(optionValue);

    return (
      <ComboboxPrimitive.Item
        key={optionValue}
        value={item}
        disabled={isOptionDisabled?.(option)}
        className={cn(
          COMBOBOX_ROW_CLASS,
          "relative pl-2",
          renderOptionIndicator ? "pr-2" : "pr-8",
          "data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-foreground/5 data-[highlighted]:text-foreground"
        )}
      >
        <span className="min-w-0 flex-1">
          {renderOption?.(option, { isSelected }) ?? (
            <span className="block truncate">{getOptionLabel(option)}</span>
          )}
        </span>
        {renderOptionIndicator ? (
          <span className="ml-2 shrink-0">{renderOptionIndicator(option, { isSelected })}</span>
        ) : (
          <ComboboxPrimitive.ItemIndicator className="absolute right-2 flex size-4 items-center justify-center">
            <CheckIcon className="size-4" />
          </ComboboxPrimitive.ItemIndicator>
        )}
        {isSelected && <span className="sr-only">Current selection</span>}
      </ComboboxPrimitive.Item>
    );
  };

  return (
    <>
      <ComboboxPrimitive.List
        aria-label={ariaLabel}
        aria-busy={isLoading || undefined}
        onWheel={(event) => event.stopPropagation()}
        className={() =>
          cn(
            "thin-scrollbar scroll-py-1 overflow-y-auto overscroll-contain p-1 outline-none",
            (isLoading || isEmpty) && "hidden"
          )
        }
        style={{ maxHeight }}
      >
        {getOptionGroup
          ? (group: ComboboxGroup<TOption>) => (
              <ComboboxPrimitive.Group
                key={group.value}
                items={group.items}
                aria-label={group.isCreationGroup ? "Create option" : undefined}
              >
                {!group.isCreationGroup && (
                  <ComboboxPrimitive.GroupLabel className="px-2 py-1.5 text-xs font-medium text-muted">
                    {group.value}
                  </ComboboxPrimitive.GroupLabel>
                )}
                <ComboboxPrimitive.Collection>{renderItem}</ComboboxPrimitive.Collection>
              </ComboboxPrimitive.Group>
            )
          : renderItem}
      </ComboboxPrimitive.List>
      {isLoading ? (
        <div
          role="status"
          className="flex min-h-16 items-center justify-center px-3 py-4 text-sm text-muted"
        >
          <span>{loadingMessage}</span>
        </div>
      ) : (
        isEmpty && (
          <div role="status" className="py-6 text-center text-sm text-muted">
            {emptyMessage}
          </div>
        )
      )}
    </>
  );
};

type ComboboxSelectAllProps = {
  areAllSelected: boolean;
  optionCount: number;
  onToggle: () => void;
};

const ComboboxSelectAll = ({ areAllSelected, optionCount, onToggle }: ComboboxSelectAllProps) => (
  <div className="border-b border-border p-1">
    <button
      type="button"
      // Keep focus on the search input so the popup stays open after toggling.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onToggle}
      className={cn(
        COMBOBOX_ROW_CLASS,
        "w-full justify-between px-2",
        "hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      <span className="truncate">
        {areAllSelected ? "Clear Selection" : `Select All (${optionCount})`}
      </span>
      {areAllSelected && <CheckIcon className="size-4 shrink-0" />}
    </button>
  </div>
);

type ComboboxPopupProps = {
  anchor?: React.RefObject<HTMLElement | null>;
  ariaLabel?: string;
  children: React.ReactNode;
  className?: string;
  initialFocus?: React.RefObject<HTMLElement | null>;
  portalContainer?: HTMLElement | React.RefObject<HTMLElement | null> | null;
};

const ComboboxPopup = ({
  anchor,
  ariaLabel,
  children,
  className,
  initialFocus,
  portalContainer
}: ComboboxPopupProps) => (
  <ComboboxPrimitive.Portal
    // Base UI treats an explicit null container as "not yet resolved" and never renders
    // the popup, so a null (e.g. a ref read before attachment) must degrade to the
    // document.body default. Prefer passing the RefObject itself: it is resolved lazily
    // at open time.
    container={portalContainer ?? undefined}
    data-slot="combobox-portal"
    className="pointer-events-auto"
  >
    <ComboboxPrimitive.Positioner
      anchor={anchor}
      align="start"
      sideOffset={4}
      collisionPadding={8}
      className="isolate z-[var(--z-index-combobox)] max-w-[calc(100vw-1rem)] outline-none"
    >
      <ComboboxPrimitive.Popup
        aria-label={ariaLabel}
        initialFocus={initialFocus}
        className={cn(
          "text-popover-foreground w-(--anchor-width) max-w-(--available-width) origin-(--transform-origin) overflow-hidden rounded-md border border-border bg-popover shadow-md outline-none",
          "transition-[transform,scale,opacity] duration-100 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
          className
        )}
      >
        {children}
      </ComboboxPrimitive.Popup>
    </ComboboxPrimitive.Positioner>
  </ComboboxPrimitive.Portal>
);

const useComboboxFilter = <TOption,>({
  getOptionKeywords,
  getOptionLabel
}: Pick<ComboboxSharedProps<TOption>, "getOptionKeywords" | "getOptionLabel">) =>
  React.useCallback(
    (option: TOption, query: string) => {
      const normalizedQuery = normalizeSearchText(query.trim());
      if (!normalizedQuery) return true;

      return [getOptionLabel(option), ...(getOptionKeywords?.(option) ?? [])].some((keyword) =>
        normalizeSearchText(keyword).includes(normalizedQuery)
      );
    },
    [getOptionKeywords, getOptionLabel]
  );

const useComboboxCreation = <TOption,>({
  creation,
  onSuccess
}: {
  creation?: ComboboxCreationConfig<TOption>;
  onSuccess: (inputValue: string) => void;
}) => {
  const pendingRef = React.useRef(false);
  const requestIdRef = React.useRef(0);
  const [state, setState] = React.useState<
    | { status: "idle" }
    | { status: "pending"; inputValue: string }
    | { status: "failed"; inputValue: string; error: unknown }
  >({ status: "idle" });

  React.useEffect(
    () => () => {
      requestIdRef.current += 1;
      pendingRef.current = false;
    },
    []
  );

  const clearError = React.useCallback(() => {
    setState((current) => (current.status === "failed" ? { status: "idle" } : current));
  }, []);

  const create = React.useCallback(
    (inputValue: string) => {
      if (!creation || creation.isDisabled || creation.isPending || pendingRef.current) return;

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      pendingRef.current = true;
      setState({ status: "pending", inputValue });

      Promise.resolve()
        .then(() => creation.onCreate(inputValue))
        .then(
          () => {
            if (requestIdRef.current !== requestId) return;
            pendingRef.current = false;
            setState({ status: "idle" });
            onSuccess(inputValue);
          },
          (error: unknown) => {
            if (requestIdRef.current !== requestId) return;
            pendingRef.current = false;
            setState({ status: "failed", error, inputValue });
          }
        );
    },
    [creation, onSuccess]
  );

  return {
    clearError,
    create,
    creationError:
      state.status === "failed" ? { error: state.error, inputValue: state.inputValue } : null,
    isCreationPending: state.status === "pending" || Boolean(creation?.isPending),
    isCreationActive: () => pendingRef.current,
    pendingInputValue: state.status === "pending" ? state.inputValue : null
  };
};

const SingleCombobox = <TOption,>({
  options = [],
  value,
  onValueChange,
  getOptionValue,
  getOptionLabel,
  getOptionKeywords,
  getOptionGroup,
  isOptionDisabled,
  renderOption,
  renderOptionIndicator,
  renderValue,
  onClear,
  clearAriaLabel = "Clear selection",
  placeholder = "Select an option...",
  searchPlaceholder = "Search...",
  searchAriaLabel = searchPlaceholder,
  emptyMessage = "No options found.",
  loadingMessage = "Loading options...",
  isDisabled = false,
  isLoading = false,
  isError = false,
  modal = false,
  portalContainer: portalContainerProp,
  className,
  contentClassName,
  onInputValueChange,
  shouldFilter = true,
  includeMissingSelectedOptions = true,
  creation,
  id,
  onKeyDown,
  ...inputProps
}: ComboboxSingleProps<TOption>) => {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const highlightedOptionValueRef = React.useRef<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const selectedLabel = value == null ? "" : getOptionLabel(value);
  const [search, setSearch] = React.useState("");
  const searchRef = React.useRef(search);
  searchRef.current = search;
  const selectedOptions = React.useMemo(() => (value == null ? [] : [value]), [value]);
  const items = useComboboxItems(
    options,
    selectedOptions,
    getOptionValue,
    includeMissingSelectedOptions
  );
  const { itemsByValue, rootItems } = usePrimitiveComboboxItems(
    items,
    getOptionValue,
    getOptionGroup
  );
  const selectedItem =
    value == null
      ? null
      : (itemsByValue.get(getOptionValue(value)) ?? ({ type: "option", option: value } as const));
  const filter = useComboboxFilter({ getOptionKeywords, getOptionLabel });
  const primitiveFilter = React.useCallback(
    (item: ComboboxItem<TOption>, query: string) =>
      item.type === "create" || filter(item.option, query),
    [filter]
  );
  const visibleOptions = React.useMemo(
    () => items.filter((option) => !shouldFilter || filter(option, search)),
    [filter, items, search, shouldFilter]
  );
  const selectableOptions = React.useMemo(
    () => visibleOptions.filter((option) => !isOptionDisabled?.(option)),
    [isOptionDisabled, visibleOptions]
  );
  const selectedValues = React.useMemo(
    () => new Set(value == null ? [] : [getOptionValue(value)]),
    [getOptionValue, value]
  );
  const creationInput = creation
    ? getComboboxCreationInput({
        inputValue: search,
        options,
        selectedOptions,
        getOptionLabel,
        isDuplicate: creation.isDuplicate,
        isValid: creation.isValid
      })
    : null;
  const handleCreationSuccess = React.useCallback(
    (inputValue: string) => {
      if (searchRef.current.trim() !== inputValue) return;
      setOpen(false);
      setSearch("");
      onInputValueChange?.("");
    },
    [onInputValueChange]
  );
  const {
    clearError: clearCreationError,
    create: createOption,
    creationError,
    isCreationActive,
    isCreationPending,
    pendingInputValue
  } = useComboboxCreation({ creation, onSuccess: handleCreationSuccess });
  const creationItem: ComboboxCreateItem | null =
    pendingInputValue || creationInput
      ? { type: "create", inputValue: pendingInputValue ?? creationInput! }
      : null;
  const primitiveItems = React.useMemo(() => {
    if (!creationItem) return rootItems;
    if (!getOptionGroup) return [...rootItems, creationItem];
    return [
      ...rootItems,
      {
        type: "group" as const,
        value: "__combobox-creation__",
        items: [creationItem],
        isCreationGroup: true
      }
    ];
  }, [creationItem, getOptionGroup, rootItems]);
  let statusMessage: React.ReactNode = null;
  if (isLoading) statusMessage = loadingMessage;
  else if (isCreationPending) statusMessage = "Creating option...";

  return (
    <ComboboxPrimitive.Root<ComboboxItem<TOption>, false>
      items={primitiveItems}
      value={selectedItem}
      onValueChange={(nextValue, eventDetails) => {
        if (nextValue == null) {
          if (eventDetails.reason === "clear-press") {
            setSearch("");
            onClear?.();
          }
          return;
        }
        if (nextValue.type === "create") {
          eventDetails.cancel();
          createOption(nextValue.inputValue);
          return;
        }
        onValueChange(nextValue.option);
      }}
      open={open}
      onOpenChange={(nextOpen, eventDetails) => {
        if (!nextOpen && isCreationActive() && eventDetails.reason === "item-press") {
          setOpen(true);
          return;
        }
        setOpen(nextOpen);
        if (nextOpen && !isCreationActive()) {
          // Clicking into a selected combobox starts from its current label. When
          // typing itself opens the popup, preserve the query emitted just before
          // this event instead of replacing the user's first keystroke. Consumers
          // that search server-side never receive the seeded label (it would be
          // sent as a query and match nothing), so their input must stay in step
          // with the empty query the parent still holds.
          if (eventDetails.reason !== "input-change") setSearch(shouldFilter ? selectedLabel : "");
        } else if (!isCreationActive()) {
          highlightedOptionValueRef.current = null;
          setSearch("");
          clearCreationError();
          onInputValueChange?.("");
        }
      }}
      onItemHighlighted={(item) => {
        highlightedOptionValueRef.current =
          item?.type === "option" ? getOptionValue(item.option) : (item?.inputValue ?? null);
      }}
      inputValue={open ? search : selectedLabel}
      onInputValueChange={(nextValue, eventDetails) => {
        if (eventDetails.reason === "input-change" || eventDetails.reason === "input-clear") {
          setSearch(nextValue);
          clearCreationError();
          onInputValueChange?.(nextValue);
        }
      }}
      itemToStringLabel={(item) =>
        item.type === "create" ? item.inputValue : getOptionLabel(item.option)
      }
      itemToStringValue={(item) =>
        item.type === "create" ? `create:${item.inputValue}` : getOptionValue(item.option)
      }
      isItemEqualToValue={(option, selectedOption) =>
        option.type === "option" &&
        selectedOption.type === "option" &&
        getOptionValue(option.option) === getOptionValue(selectedOption.option)
      }
      filter={shouldFilter ? primitiveFilter : null}
      disabled={isDisabled}
      modal={modal}
      autoHighlight
    >
      <div className="relative w-full">
        <ComboboxPrimitive.Input
          ref={inputRef}
          id={id}
          data-slot="combobox-input"
          data-invalid={isError}
          aria-invalid={isError || undefined}
          aria-busy={isLoading || isCreationPending || undefined}
          placeholder={open ? searchPlaceholder : placeholder}
          onKeyDown={(event) => {
            onKeyDown?.(event);

            const hasHighlightedOption = highlightedOptionValueRef.current != null;
            if (
              !event.defaultPrevented &&
              event.key === "Enter" &&
              open &&
              !isLoading &&
              !hasHighlightedOption &&
              selectableOptions[0]
            ) {
              onValueChange(selectableOptions[0]);
              setOpen(false);
              setSearch("");
              onInputValueChange?.("");
            }

            preventComboboxFormSubmit(event);
          }}
          className={cn(
            "h-9 w-full rounded-md border border-border bg-transparent py-2 pr-9 pl-2.5 text-sm text-foreground transition-[color,box-shadow] outline-none placeholder:text-muted",
            "hover:border-foreground/20 focus:border-ring focus:ring-[3px] focus:ring-ring/50",
            "data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[invalid=true]:border-danger data-[invalid=true]:ring-danger/40",
            !open && value != null && renderValue && "text-transparent",
            className
          )}
          {...inputProps}
        />
        {!open && value != null && renderValue && (
          <span
            className={cn(
              "pointer-events-none absolute inset-y-0 right-9 left-2.5 flex min-w-0 items-center truncate text-sm text-foreground",
              isDisabled && "opacity-50"
            )}
          >
            {renderValue(value)}
          </span>
        )}
        {value != null && onClear && (
          <ComboboxPrimitive.Clear
            aria-label={clearAriaLabel}
            tabIndex={0}
            onClick={() => window.requestAnimationFrame(() => inputRef.current?.focus())}
            className={cn(
              "absolute top-1/2 right-7 z-10 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted outline-none",
              "hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[popup-open]:hidden"
            )}
          >
            <XIcon className="size-3.5" />
          </ComboboxPrimitive.Clear>
        )}
        {isLoading ? (
          <Loader2Icon
            className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 animate-spin text-accent"
            aria-hidden="true"
          />
        ) : (
          <ChevronDownIcon
            className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-accent"
            aria-hidden="true"
          />
        )}
        {isLoading && <span className="sr-only">{loadingMessage}</span>}
      </div>
      <ComboboxPrimitive.Status className="sr-only">{statusMessage}</ComboboxPrimitive.Status>
      <ComboboxPopup
        anchor={inputRef}
        ariaLabel={searchAriaLabel}
        className={contentClassName}
        portalContainer={portalContainerProp}
      >
        <ComboboxList
          emptyMessage={typeof emptyMessage === "function" ? emptyMessage(search) : emptyMessage}
          loadingMessage={loadingMessage}
          creation={creation}
          isLoading={isLoading}
          getOptionValue={getOptionValue}
          getOptionLabel={getOptionLabel}
          getOptionGroup={getOptionGroup}
          isOptionDisabled={isOptionDisabled}
          renderOption={renderOption}
          renderOptionIndicator={renderOptionIndicator}
          ariaLabel={`${searchAriaLabel} suggestions`}
          isEmpty={visibleOptions.length === 0 && !creationItem}
          selectedValues={selectedValues}
          maxHeight={SINGLE_LIST_MAX_HEIGHT}
          creationError={creationError}
          isCreationPending={isCreationPending}
        />
      </ComboboxPopup>
    </ComboboxPrimitive.Root>
  );
};

const MultipleCombobox = <TOption,>({
  options = [],
  value = [],
  onValueChange,
  getOptionValue,
  getOptionLabel,
  getOptionKeywords,
  getOptionGroup,
  isOptionDisabled,
  renderOption,
  renderOptionIndicator,
  renderValue,
  onClear,
  clearAriaLabel = "Clear all selections",
  singleLine = false,
  isSelectAll = false,
  placeholder = "Select options...",
  searchPlaceholder = "Search...",
  searchAriaLabel = searchPlaceholder,
  emptyMessage = "No options found.",
  loadingMessage = "Loading options...",
  isDisabled = false,
  isLoading = false,
  isError = false,
  modal = false,
  portalContainer: portalContainerProp,
  className,
  contentClassName,
  onInputValueChange,
  shouldFilter = true,
  includeMissingSelectedOptions = true,
  creation,
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  onKeyDown,
  ...inputProps
}: ComboboxMultipleProps<TOption>) => {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const chipsRef = React.useRef<HTMLDivElement | null>(null);
  const { scrollEdges, setViewportRef } = useScrollEdges<HTMLDivElement>(
    singleLine ? "horizontal" : "vertical"
  );
  const [open, setOpen] = React.useState(false);
  const openRef = React.useRef(open);
  openRef.current = open;
  const [search, setSearch] = React.useState("");
  const searchRef = React.useRef(search);
  searchRef.current = search;
  const selectedOptions = React.useMemo(() => [...value], [value]);
  const items = useComboboxItems(
    options,
    selectedOptions,
    getOptionValue,
    includeMissingSelectedOptions
  );
  const { itemsByValue, rootItems } = usePrimitiveComboboxItems(
    items,
    getOptionValue,
    getOptionGroup
  );
  const selectedItems = React.useMemo(
    () =>
      selectedOptions.map(
        (option) =>
          itemsByValue.get(getOptionValue(option)) ?? ({ type: "option", option } as const)
      ),
    [getOptionValue, itemsByValue, selectedOptions]
  );
  const filter = useComboboxFilter({ getOptionKeywords, getOptionLabel });
  const primitiveFilter = React.useCallback(
    (item: ComboboxItem<TOption>, query: string) =>
      item.type === "create" || filter(item.option, query),
    [filter]
  );
  const selectedValues = React.useMemo(
    () => new Set(value.map(getOptionValue)),
    [getOptionValue, value]
  );
  const visibleOptions = React.useMemo(
    () => items.filter((option) => !shouldFilter || filter(option, search)),
    [filter, items, search, shouldFilter]
  );
  // Select all only covers the visible result set. External-search consumers
  // provide an already-filtered list, so do not apply the local filter again.
  const selectAllOptions = React.useMemo(
    () => (isSelectAll ? visibleOptions.filter((option) => !isOptionDisabled?.(option)) : []),
    [isOptionDisabled, isSelectAll, visibleOptions]
  );
  const areAllOptionsSelected =
    selectAllOptions.length > 0 &&
    selectAllOptions.every((option) => selectedValues.has(getOptionValue(option)));
  const creationInput = creation
    ? getComboboxCreationInput({
        inputValue: search,
        options,
        selectedOptions,
        getOptionLabel,
        isDuplicate: creation.isDuplicate,
        isValid: creation.isValid
      })
    : null;
  const handleCreationSuccess = React.useCallback(
    (inputValue: string) => {
      if (searchRef.current.trim() !== inputValue) return;
      setSearch("");
      onInputValueChange?.("");
      if (openRef.current) window.requestAnimationFrame(() => inputRef.current?.focus());
    },
    [onInputValueChange]
  );
  const {
    clearError: clearCreationError,
    create: createOption,
    creationError,
    isCreationActive,
    isCreationPending,
    pendingInputValue
  } = useComboboxCreation({ creation, onSuccess: handleCreationSuccess });
  const creationItem: ComboboxCreateItem | null =
    pendingInputValue || creationInput
      ? { type: "create", inputValue: pendingInputValue ?? creationInput! }
      : null;
  const primitiveItems = React.useMemo(() => {
    if (!creationItem) return rootItems;
    if (!getOptionGroup) return [...rootItems, creationItem];
    return [
      ...rootItems,
      {
        type: "group" as const,
        value: "__combobox-creation__",
        items: [creationItem],
        isCreationGroup: true
      }
    ];
  }, [creationItem, getOptionGroup, rootItems]);
  let statusMessage: React.ReactNode = null;
  if (isLoading) statusMessage = loadingMessage;
  else if (isCreationPending) statusMessage = "Creating option...";

  const handleSelectAllToggle = () => {
    const selectAllValues = new Set(selectAllOptions.map(getOptionValue));

    onValueChange(
      areAllOptionsSelected
        ? selectedOptions.filter((option) => !selectAllValues.has(getOptionValue(option)))
        : [
            ...selectedOptions,
            ...selectAllOptions.filter((option) => !selectedValues.has(getOptionValue(option)))
          ]
    );
  };

  return (
    <ComboboxPrimitive.Root<ComboboxItem<TOption>, true>
      multiple
      items={primitiveItems}
      value={selectedItems}
      onValueChange={(nextValue, eventDetails) => {
        const createItem = nextValue.find((item) => item.type === "create");
        if (createItem) {
          eventDetails.cancel();
          createOption(createItem.inputValue);
          return;
        }

        if (eventDetails.reason === "item-press") {
          eventDetails.cancel();
          setSearch("");
          setOpen(true);
          window.requestAnimationFrame(() => inputRef.current?.focus());
        }

        if (eventDetails.reason === "clear-press" && onClear) {
          onClear();
          return;
        }

        onValueChange(nextValue.flatMap((item) => (item.type === "option" ? [item.option] : [])));
      }}
      open={open}
      onOpenChange={(nextOpen, eventDetails) => {
        if (!nextOpen && isCreationActive() && eventDetails.reason === "item-press") {
          openRef.current = true;
          setOpen(true);
          return;
        }
        openRef.current = nextOpen;
        setOpen(nextOpen);
        if (!nextOpen && !isCreationActive()) {
          setSearch("");
          clearCreationError();
          onInputValueChange?.("");
        }
      }}
      inputValue={search}
      onInputValueChange={(nextValue, eventDetails) => {
        if (eventDetails.reason === "input-change" || eventDetails.reason === "input-clear") {
          setSearch(nextValue);
          clearCreationError();
          onInputValueChange?.(nextValue);
        }
      }}
      itemToStringLabel={(item) =>
        item.type === "create" ? item.inputValue : getOptionLabel(item.option)
      }
      itemToStringValue={(item) =>
        item.type === "create" ? `create:${item.inputValue}` : getOptionValue(item.option)
      }
      isItemEqualToValue={(option, selectedOption) =>
        option.type === "option" &&
        selectedOption.type === "option" &&
        getOptionValue(option.option) === getOptionValue(selectedOption.option)
      }
      filter={shouldFilter ? primitiveFilter : null}
      disabled={isDisabled}
      modal={modal}
      autoHighlight
    >
      <ComboboxPrimitive.Chips
        ref={chipsRef}
        data-slot="combobox-chips"
        data-disabled={isDisabled ? "" : undefined}
        data-invalid={isError}
        className={cn(
          "flex min-h-9 w-full gap-1 rounded-md border border-border bg-transparent text-sm text-foreground transition-[color,box-shadow] outline-none",
          singleLine ? "items-center" : "items-start",
          "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 hover:border-foreground/20",
          "data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[invalid=true]:border-danger data-[invalid=true]:ring-danger/40",
          value.length > 0 ? "p-1" : "py-1 pr-2 pl-2.5",
          className
        )}
      >
        <div
          className={cn(
            "scroll-edge-fade flex thin-scrollbar min-w-0 flex-1 items-center gap-1",
            singleLine ? "overflow-x-auto" : "max-h-24 flex-wrap overflow-y-auto"
          )}
          ref={setViewportRef}
          data-scroll-edge-axis={singleLine ? "horizontal" : "vertical"}
          data-scrollable-start={scrollEdges.start}
          data-scrollable-end={scrollEdges.end}
        >
          <ComboboxPrimitive.Value>
            {(selectedValue: ComboboxItem<TOption>[]) => (
              <>
                {selectedValue.map((item) => {
                  if (item.type === "create") return null;
                  const { option } = item;
                  const label = getOptionLabel(option);
                  return (
                    <ComboboxPrimitive.Chip
                      key={getOptionValue(option)}
                      className="flex h-6.5 max-w-full items-center gap-1 rounded-sm bg-foreground/10 px-1.5 text-xs text-foreground outline-none focus:ring-2 focus:ring-ring"
                    >
                      <span className="max-w-48 truncate">{renderValue?.(option) ?? label}</span>
                      {!isDisabled && (
                        <ComboboxPrimitive.ChipRemove
                          aria-label={`Remove ${label}`}
                          className="flex size-4 shrink-0 items-center justify-center rounded-xs text-muted outline-none hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <XIcon className="size-3" />
                        </ComboboxPrimitive.ChipRemove>
                      )}
                    </ComboboxPrimitive.Chip>
                  );
                })}
              </>
            )}
          </ComboboxPrimitive.Value>
          <ComboboxPrimitive.Input
            ref={inputRef}
            id={id}
            aria-label={getComboboxInputAriaLabel({
              ariaLabel,
              ariaLabelledBy,
              id,
              searchAriaLabel
            })}
            aria-labelledby={ariaLabelledBy}
            aria-invalid={isError || undefined}
            aria-busy={isLoading || isCreationPending || undefined}
            placeholder={value.length === 0 ? placeholder : undefined}
            onKeyDown={(event) => {
              onKeyDown?.(event);
              preventComboboxFormSubmit(event);
            }}
            className="h-6 min-w-24 flex-1 bg-transparent px-0.5 text-sm text-foreground outline-none placeholder:text-muted"
            {...inputProps}
          />
        </div>
        {value.length > 0 && !isDisabled && (
          <ComboboxPrimitive.Clear
            aria-label={clearAriaLabel}
            tabIndex={0}
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted outline-none hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
          >
            <XIcon className="size-3.5" />
          </ComboboxPrimitive.Clear>
        )}
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none flex h-6 shrink-0 items-center justify-center text-accent",
            value.length > 0 && "mr-1"
          )}
        >
          {isLoading ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <ChevronDownIcon className="size-4" />
          )}
        </span>
      </ComboboxPrimitive.Chips>
      <ComboboxPrimitive.Status className="sr-only">{statusMessage}</ComboboxPrimitive.Status>
      <ComboboxPopup
        anchor={chipsRef}
        className={contentClassName}
        portalContainer={portalContainerProp}
      >
        {selectAllOptions.length > 0 && (
          <ComboboxSelectAll
            areAllSelected={areAllOptionsSelected}
            optionCount={selectAllOptions.length}
            onToggle={handleSelectAllToggle}
          />
        )}
        <ComboboxList
          emptyMessage={typeof emptyMessage === "function" ? emptyMessage(search) : emptyMessage}
          loadingMessage={loadingMessage}
          creation={creation}
          isLoading={isLoading}
          getOptionValue={getOptionValue}
          getOptionLabel={getOptionLabel}
          getOptionGroup={getOptionGroup}
          isOptionDisabled={isOptionDisabled}
          renderOption={renderOption}
          renderOptionIndicator={renderOptionIndicator}
          ariaLabel={`${searchAriaLabel} suggestions`}
          isEmpty={visibleOptions.length === 0 && !creationItem}
          selectedValues={selectedValues}
          maxHeight={MULTIPLE_LIST_MAX_HEIGHT}
          creationError={creationError}
          isCreationPending={isCreationPending}
        />
      </ComboboxPopup>
    </ComboboxPrimitive.Root>
  );
};

/**
 * Searchable object select built on Base UI. Use `multiple` for the chips-based
 * multi-select contract while legacy `FilterableSelect` consumers migrate incrementally.
 */
function Combobox<TOption>(props: ComboboxProps<TOption>) {
  const { multiple } = props;
  if (multiple) return <MultipleCombobox {...props} />;
  return <SingleCombobox {...props} />;
}

export {
  Combobox,
  type ComboboxCreationConfig,
  type ComboboxMultipleProps,
  type ComboboxProps,
  type ComboboxRenderOptionState,
  type ComboboxSingleProps
};
