import * as React from "react";
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { CheckIcon, ChevronDownIcon, Loader2Icon, XIcon } from "lucide-react";

import { cn } from "../../utils";
import { useScrollEdges } from "../../utils/useScrollEdges";

import "../../utils/ScrollEdgeFade.css";

type ComboboxRenderOptionState = {
  isSelected: boolean;
};

type ComboboxSharedProps<TOption> = {
  options: readonly TOption[];
  getOptionValue: (option: TOption) => string;
  getOptionLabel: (option: TOption) => string;
  getOptionKeywords?: (option: TOption) => readonly string[];
  isOptionDisabled?: (option: TOption) => boolean;
  renderOption?: (option: TOption, state: ComboboxRenderOptionState) => React.ReactNode;
  renderValue?: (option: TOption) => React.ReactNode;
  clearAriaLabel?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  searchAriaLabel?: string;
  emptyMessage?: React.ReactNode;
  loadingMessage?: React.ReactNode;
  isDisabled?: boolean;
  isLoading?: boolean;
  isError?: boolean;
  modal?: boolean;
  portalContainer?: HTMLElement | React.RefObject<HTMLElement | null> | null;
  contentClassName?: string;
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
  getOptionValue: (option: TOption) => string
) =>
  React.useMemo(() => {
    const selectedByValue = new Map(
      selectedOptions.map((option) => [getOptionValue(option), option] as const)
    );
    const optionValues = new Set<string>();
    const stableOptions = options.map((option) => {
      const optionValue = getOptionValue(option);
      optionValues.add(optionValue);
      return selectedByValue.get(optionValue) ?? option;
    });

    selectedOptions.forEach((option) => {
      if (!optionValues.has(getOptionValue(option))) stableOptions.push(option);
    });

    return stableOptions;
  }, [getOptionValue, options, selectedOptions]);

type ComboboxListProps<TOption> = Pick<
  ComboboxSharedProps<TOption>,
  | "emptyMessage"
  | "getOptionLabel"
  | "getOptionValue"
  | "isLoading"
  | "isOptionDisabled"
  | "loadingMessage"
  | "renderOption"
> & {
  ariaLabel: string;
  selectedValues: ReadonlySet<string>;
  maxHeight: string;
};

const ComboboxList = <TOption,>({
  emptyMessage,
  getOptionLabel,
  getOptionValue,
  isLoading,
  isOptionDisabled,
  loadingMessage,
  renderOption,
  ariaLabel,
  selectedValues,
  maxHeight
}: ComboboxListProps<TOption>) => (
  <>
    <ComboboxPrimitive.List
      aria-label={ariaLabel}
      aria-busy={isLoading || undefined}
      onWheel={(event) => event.stopPropagation()}
      className="thin-scrollbar scroll-py-1 overflow-y-auto overscroll-contain p-1 outline-none"
      style={{ maxHeight }}
    >
      {(option: TOption) => {
        const optionValue = getOptionValue(option);
        const isSelected = selectedValues.has(optionValue);

        return (
          <ComboboxPrimitive.Item
            key={optionValue}
            value={option}
            disabled={isOptionDisabled?.(option)}
            className={cn(
              COMBOBOX_ROW_CLASS,
              "relative pr-8 pl-2",
              "data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-foreground/5 data-[highlighted]:text-foreground"
            )}
          >
            <span className="min-w-0 flex-1">
              {renderOption?.(option, { isSelected }) ?? (
                <span className="block truncate">{getOptionLabel(option)}</span>
              )}
            </span>
            <ComboboxPrimitive.ItemIndicator className="absolute right-2 flex size-4 items-center justify-center">
              <CheckIcon className="size-4" />
            </ComboboxPrimitive.ItemIndicator>
            {isSelected && <span className="sr-only">Current selection</span>}
          </ComboboxPrimitive.Item>
        );
      }}
    </ComboboxPrimitive.List>
    <ComboboxPrimitive.Empty className="py-6 text-center text-sm text-muted empty:hidden">
      {isLoading ? loadingMessage : emptyMessage}
    </ComboboxPrimitive.Empty>
  </>
);

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
      className="isolate z-[60] max-w-[calc(100vw-1rem)] outline-none"
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

const SingleCombobox = <TOption,>({
  options,
  value,
  onValueChange,
  getOptionValue,
  getOptionLabel,
  getOptionKeywords,
  isOptionDisabled,
  renderOption,
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
  id,
  onKeyDown,
  ...inputProps
}: ComboboxSingleProps<TOption>) => {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = React.useState(false);
  const selectedOptions = React.useMemo(() => (value == null ? [] : [value]), [value]);
  const items = useComboboxItems(options, selectedOptions, getOptionValue);
  const filter = useComboboxFilter({ getOptionKeywords, getOptionLabel });
  const selectedValues = React.useMemo(
    () => new Set(value == null ? [] : [getOptionValue(value)]),
    [getOptionValue, value]
  );

  return (
    <ComboboxPrimitive.Root<TOption, false>
      items={items}
      value={value ?? null}
      onValueChange={(nextValue, eventDetails) => {
        if (nextValue == null) {
          if (eventDetails.reason === "clear-press") onClear?.();
          return;
        }
        onValueChange(nextValue);
      }}
      open={open}
      onOpenChange={setOpen}
      itemToStringLabel={getOptionLabel}
      itemToStringValue={getOptionValue}
      isItemEqualToValue={(option, selectedOption) =>
        getOptionValue(option) === getOptionValue(selectedOption)
      }
      filter={filter}
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
          aria-busy={isLoading || undefined}
          placeholder={open ? searchPlaceholder : placeholder}
          onKeyDown={(event) => {
            onKeyDown?.(event);
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
      <ComboboxPrimitive.Status className="sr-only">
        {isLoading ? loadingMessage : null}
      </ComboboxPrimitive.Status>
      <ComboboxPopup
        anchor={inputRef}
        ariaLabel={searchAriaLabel}
        className={contentClassName}
        portalContainer={portalContainerProp}
      >
        <ComboboxList
          emptyMessage={emptyMessage}
          loadingMessage={loadingMessage}
          isLoading={isLoading}
          getOptionValue={getOptionValue}
          getOptionLabel={getOptionLabel}
          isOptionDisabled={isOptionDisabled}
          renderOption={renderOption}
          ariaLabel={`${searchAriaLabel} suggestions`}
          selectedValues={selectedValues}
          maxHeight={SINGLE_LIST_MAX_HEIGHT}
        />
      </ComboboxPopup>
    </ComboboxPrimitive.Root>
  );
};

const MultipleCombobox = <TOption,>({
  options,
  value = [],
  onValueChange,
  getOptionValue,
  getOptionLabel,
  getOptionKeywords,
  isOptionDisabled,
  renderOption,
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
  id,
  onKeyDown,
  ...inputProps
}: ComboboxMultipleProps<TOption>) => {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const chipsRef = React.useRef<HTMLDivElement | null>(null);
  const { scrollEdges, setViewportRef } = useScrollEdges<HTMLDivElement>(
    singleLine ? "horizontal" : "vertical"
  );
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const selectedOptions = React.useMemo(() => [...value], [value]);
  const items = useComboboxItems(options, selectedOptions, getOptionValue);
  const filter = useComboboxFilter({ getOptionKeywords, getOptionLabel });
  const selectedValues = React.useMemo(
    () => new Set(value.map(getOptionValue)),
    [getOptionValue, value]
  );
  // Select all only covers the options matching the current search, so a filtered
  // list toggles what is on screen instead of the entire option set.
  const selectAllOptions = React.useMemo(
    () =>
      isSelectAll
        ? items.filter((option) => !isOptionDisabled?.(option) && filter(option, search))
        : [],
    [filter, isOptionDisabled, isSelectAll, items, search]
  );
  const areAllOptionsSelected =
    selectAllOptions.length > 0 &&
    selectAllOptions.every((option) => selectedValues.has(getOptionValue(option)));

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
    <ComboboxPrimitive.Root<TOption, true>
      multiple
      items={items}
      value={selectedOptions}
      onValueChange={(nextValue, eventDetails) => {
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

        onValueChange(nextValue);
      }}
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setSearch("");
      }}
      inputValue={search}
      onInputValueChange={setSearch}
      itemToStringLabel={getOptionLabel}
      itemToStringValue={getOptionValue}
      isItemEqualToValue={(option, selectedOption) =>
        getOptionValue(option) === getOptionValue(selectedOption)
      }
      filter={filter}
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
            {(selectedValue: TOption[]) => (
              <>
                {selectedValue.map((option) => {
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
            aria-label={searchAriaLabel}
            aria-invalid={isError || undefined}
            aria-busy={isLoading || undefined}
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
      <ComboboxPrimitive.Status className="sr-only">
        {isLoading ? loadingMessage : null}
      </ComboboxPrimitive.Status>
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
          emptyMessage={emptyMessage}
          loadingMessage={loadingMessage}
          isLoading={isLoading}
          getOptionValue={getOptionValue}
          getOptionLabel={getOptionLabel}
          isOptionDisabled={isOptionDisabled}
          renderOption={renderOption}
          ariaLabel={`${searchAriaLabel} suggestions`}
          selectedValues={selectedValues}
          maxHeight={MULTIPLE_LIST_MAX_HEIGHT}
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
  type ComboboxMultipleProps,
  type ComboboxProps,
  type ComboboxRenderOptionState,
  type ComboboxSingleProps
};
