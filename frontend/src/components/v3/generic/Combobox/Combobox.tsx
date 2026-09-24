import * as React from "react";
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import { CheckIcon, ChevronDownIcon, Loader2Icon, PlusIcon, XIcon } from "lucide-react";

import { cn } from "../../utils";
import { useScrollEdges } from "../../utils/useScrollEdges";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../Dialog";
import { getComboboxInputAriaLabel } from "./combobox-accessibility";
import {
  COMBOBOX_CHIP_CLASS,
  COMBOBOX_CHIP_LABEL_CLASS,
  COMBOBOX_CHIP_REMOVE_CLASS,
  COMBOBOX_CHIPS_CLASS,
  COMBOBOX_CHIPS_INPUT_CLASS,
  comboboxChipsViewportClass
} from "./combobox-chips";
import { type ComboboxCreationContext, getComboboxCreationInput } from "./combobox-creation";
import { mergeComboboxItems } from "./combobox-items";

import "../../utils/ScrollEdgeFade.css";

type ComboboxRenderOptionState = {
  isSelected: boolean;
};

type ComboboxCreationBaseConfig<TOption> = {
  isValid?: (inputValue: string, context: ComboboxCreationContext<TOption>) => boolean;
  isDuplicate?: (inputValue: string, option: TOption) => boolean;
  formatLabel?: (inputValue: string) => React.ReactNode;
  isDisabled?: boolean;
};

type ComboboxInlineCreationConfig<TOption> = ComboboxCreationBaseConfig<TOption> & {
  mode?: "inline";
  /**
   * Owns domain-option construction, persistence, and controlled options/value
   * updates. Return the persistence promise so the combobox can retain the query
   * on failure and clear it only after success.
   */
  onCreate: (inputValue: string) => void | Promise<void>;
  formatPendingLabel?: (inputValue: string) => React.ReactNode;
  formatError?: (error: unknown, inputValue: string) => React.ReactNode;
  isPending?: boolean;
};

type ComboboxDialogCreationRenderProps = {
  initialInput: string;
  complete: () => void;
  cancel: () => void;
};

type ComboboxDialogCreationConfig<TOption> = ComboboxCreationBaseConfig<TOption> & {
  mode: "dialog";
  title: React.ReactNode;
  description: React.ReactNode;
  renderForm: (props: ComboboxDialogCreationRenderProps) => React.ReactNode;
  /** Prevent dismissing the dialog while caller-owned persistence is pending. */
  isPending?: boolean;
};

type ComboboxCreationConfig<TOption> =
  | ComboboxInlineCreationConfig<TOption>
  | ComboboxDialogCreationConfig<TOption>;

type ComboboxSharedProps<TOption> = {
  options?: readonly TOption[];
  getOptionValue: (option: TOption) => string;
  getOptionLabel: (option: TOption) => string;
  getOptionKeywords?: (option: TOption) => readonly string[];
  getOptionGroup?: (option: TOption) => string;
  isOptionDisabled?: (option: TOption) => boolean;
  onSearchChange?: (search: string) => void;
  listFooter?: React.ReactNode;
  renderOption?: (option: TOption, state: ComboboxRenderOptionState) => React.ReactNode;
  renderOptionIndicator?: (option: TOption, state: ComboboxRenderOptionState) => React.ReactNode;
  renderValue?: (option: TOption) => React.ReactNode;
  clearAriaLabel?: string;
  placeholder?: string;
  /** @deprecated Use `searchAriaLabel`. The visible placeholder no longer changes on focus. */
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
  /**
   * Adds a fixed Create footer option. Inline mode persists directly from the query;
   * dialog mode delegates metadata, validation, persistence, and controlled
   * option/selection updates to the caller's form.
   */
  creation?: ComboboxCreationConfig<TOption>;
};

type ComboboxInputProps = Omit<
  React.ComponentPropsWithoutRef<"input">,
  "children" | "disabled" | "multiple" | "onChange" | "type" | "value"
>;

type ComboboxSingleValueProps<TOption> = {
  multiple?: false;
  value?: TOption | null;
};

type ComboboxSingleDefaultClearProps<TOption> = ComboboxSingleValueProps<TOption> & {
  isClearable?: true;
  onValueChange: (option: TOption | null) => void;
  onClear?: undefined;
};

type ComboboxSingleOverrideClearProps<TOption> = ComboboxSingleValueProps<TOption> & {
  isClearable?: true;
  onValueChange: (option: TOption) => void;
  onClear: () => void;
};

type ComboboxSingleNonClearableProps<TOption> = ComboboxSingleValueProps<TOption> & {
  isClearable: false;
  onValueChange: (option: TOption) => void;
  onClear?: never;
};

type ComboboxSingleProps<TOption> = ComboboxSharedProps<TOption> &
  ComboboxInputProps &
  (
    | ComboboxSingleDefaultClearProps<TOption>
    | ComboboxSingleOverrideClearProps<TOption>
    | ComboboxSingleNonClearableProps<TOption>
  );

type ComboboxMultipleProps<TOption> = ComboboxSharedProps<TOption> &
  ComboboxInputProps & {
    multiple: true;
    singleLine?: boolean;
    isSelectAll?: boolean;
    isClearable?: boolean;
    value?: readonly TOption[];
    onValueChange: (options: TOption[]) => void;
    onClear?: () => void;
  };

type ComboboxProps<TOption> = ComboboxSingleProps<TOption> | ComboboxMultipleProps<TOption>;

const clearSingleComboboxValue = <TOption,>(props: ComboboxSingleProps<TOption>) => {
  if (props.onClear) {
    props.onClear();
    return;
  }

  if (props.isClearable !== false) props.onValueChange(null);
};

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

const isComboboxTrailingSlotEvent = (event: Event) =>
  event.target instanceof Element &&
  Boolean(event.target.closest("[data-slot='combobox-trailing-slot']"));

const isComboboxCreateItemEvent = (event: Event) =>
  event.target instanceof Element &&
  Boolean(event.target.closest("[data-slot='combobox-create-item']"));

type ComboboxTrailingSlotProps = {
  canClear: boolean;
  clearAriaLabel: string;
  isBusy: boolean;
  className?: string;
  onClear: () => void;
};

const ComboboxTrailingSlot = ({
  canClear,
  clearAriaLabel,
  isBusy,
  className,
  onClear
}: ComboboxTrailingSlotProps) => {
  let state = "chevron";
  if (canClear) state = "clear";
  if (isBusy) state = "loading";

  return (
    <div
      data-slot="combobox-trailing-slot"
      data-state={state}
      className={cn(
        "pointer-events-none flex size-7 shrink-0 items-center justify-center text-accent",
        className
      )}
    >
      {state === "loading" && <Loader2Icon aria-hidden="true" className="size-4 animate-spin" />}
      {state === "clear" && (
        <button
          type="button"
          aria-label={clearAriaLabel}
          onPointerDown={(event) => {
            event.preventDefault();
          }}
          onClick={onClear}
          className="pointer-events-auto flex size-full items-center justify-center rounded-md text-muted outline-none hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <XIcon aria-hidden="true" className="size-4" />
        </button>
      )}
      {state === "chevron" && <ChevronDownIcon aria-hidden="true" className="size-4" />}
    </div>
  );
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

const isInlineCreationConfig = <TOption,>(
  creation?: ComboboxCreationConfig<TOption>
): creation is ComboboxInlineCreationConfig<TOption> =>
  Boolean(creation && creation.mode !== "dialog");

const isDialogCreationConfig = <TOption,>(
  creation?: ComboboxCreationConfig<TOption>
): creation is ComboboxDialogCreationConfig<TOption> => creation?.mode === "dialog";

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
  showEmptyMessage: boolean;
  creationItem: ComboboxCreateItem | null;
  canCreate: boolean;
  creationError: { error: unknown; inputValue: string } | null;
  isCreationPending: boolean;
  selectedValues: ReadonlySet<string>;
  maxHeight: string;
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
  showEmptyMessage,
  creationItem,
  canCreate,
  creationError,
  isCreationPending,
  selectedValues,
  maxHeight
}: ComboboxListProps<TOption>) => {
  const inlineCreation = isInlineCreationConfig(creation) ? creation : undefined;
  const renderItem = (item: ComboboxItem<TOption>) => {
    if (item.type === "create") {
      const hasCreationError = Boolean(
        inlineCreation && creationError?.inputValue === item.inputValue
      );
      let label: React.ReactNode = "Create";
      if (item.inputValue) {
        label = creation?.formatLabel?.(item.inputValue) ?? `Create "${item.inputValue}"`;
      }
      if (isCreationPending && inlineCreation) {
        label =
          inlineCreation.formatPendingLabel?.(item.inputValue) ??
          `Creating "${item.inputValue}"...`;
      }

      return (
        <ComboboxPrimitive.Item
          key={`create:${item.inputValue}`}
          data-slot="combobox-create-item"
          value={item}
          disabled={!canCreate || creation?.isDisabled || creation?.isPending || isCreationPending}
          className={cn(
            COMBOBOX_ROW_CLASS,
            "w-full px-2 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-65 data-[highlighted]:bg-foreground/5 data-[highlighted]:text-foreground"
          )}
        >
          {isCreationPending ? (
            <Loader2Icon className="size-4 shrink-0 animate-spin text-accent" aria-hidden="true" />
          ) : (
            <PlusIcon className="size-4 shrink-0 text-accent" aria-hidden="true" />
          )}
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate">{label}</span>
            {hasCreationError && (
              <span role="alert" className="block text-xs whitespace-normal text-danger">
                {inlineCreation?.formatError?.(creationError?.error, item.inputValue) ??
                  `Could not create "${item.inputValue}". Try again.`}
              </span>
            )}
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
    <ComboboxPrimitive.List aria-label={ariaLabel} aria-busy={isLoading || undefined}>
      <div
        onWheel={(event) => event.stopPropagation()}
        className={cn(
          "thin-scrollbar scroll-py-1 overflow-y-auto overscroll-contain p-1 outline-none",
          isEmpty && "hidden"
        )}
        style={{ maxHeight }}
      >
        {getOptionGroup ? (
          <ComboboxPrimitive.Collection>
            {(group: ComboboxGroup<TOption>) =>
              group.isCreationGroup ? null : (
                <ComboboxPrimitive.Group
                  key={group.value}
                  items={group.items}
                  className={cn(group.value === "" && "mb-1 border-b border-border pb-1")}
                >
                  {group.value !== "" && (
                    <ComboboxPrimitive.GroupLabel className="px-2 py-1.5 text-xs font-medium text-muted">
                      {group.value}
                    </ComboboxPrimitive.GroupLabel>
                  )}
                  <ComboboxPrimitive.Collection>{renderItem}</ComboboxPrimitive.Collection>
                </ComboboxPrimitive.Group>
              )
            }
          </ComboboxPrimitive.Collection>
        ) : (
          <ComboboxPrimitive.Collection>
            {(item: ComboboxItem<TOption>) => (item.type === "option" ? renderItem(item) : null)}
          </ComboboxPrimitive.Collection>
        )}
      </div>
      {isEmpty && isLoading && (
        <div
          role="status"
          className="flex min-h-16 items-center justify-center px-3 py-4 text-sm text-muted"
        >
          <span>{loadingMessage}</span>
        </div>
      )}
      {isEmpty && !isLoading && showEmptyMessage && (
        <div
          role="status"
          className="flex min-h-8 items-center justify-center px-3 py-1.5 text-center text-sm text-muted"
        >
          {emptyMessage}
        </div>
      )}
      {creationItem && (
        <div className={cn("p-1", (!isEmpty || isLoading) && "border-t border-border")}>
          {getOptionGroup ? (
            <ComboboxPrimitive.Group items={[creationItem]}>
              <ComboboxPrimitive.Collection>{renderItem}</ComboboxPrimitive.Collection>
            </ComboboxPrimitive.Group>
          ) : (
            renderItem(creationItem)
          )}
        </div>
      )}
    </ComboboxPrimitive.List>
  );
};

const ComboboxListFooter = ({ children }: { children: React.ReactNode }) => (
  <div className="border-t border-border px-3 py-2 text-xs text-muted">{children}</div>
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
  creation?: ComboboxInlineCreationConfig<TOption>;
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

type ComboboxDialogCreationState<TOption> = {
  creation?: ComboboxDialogCreationConfig<TOption>;
  initialInput: string;
  isOpen: boolean;
  open: (inputValue: string) => void;
  complete: () => void;
  cancel: () => void;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: (event: Event) => void;
};

type ComboboxCreationDialogProps<TOption> = Omit<ComboboxDialogCreationState<TOption>, "open">;

const useComboboxDialogCreation = <TOption,>({
  creation,
  onComplete,
  onClosed
}: {
  creation?: ComboboxCreationConfig<TOption>;
  onComplete: (inputValue: string) => void;
  onClosed: (outcome: "complete" | "cancel") => void;
}): ComboboxDialogCreationState<TOption> => {
  const dialogCreation = isDialogCreationConfig(creation) ? creation : undefined;
  const [initialInput, setInitialInput] = React.useState("");
  const [isOpen, setIsOpen] = React.useState(false);
  const outcomeRef = React.useRef<"complete" | "cancel" | null>(null);

  const open = React.useCallback(
    (inputValue: string) => {
      if (!dialogCreation || dialogCreation.isDisabled || dialogCreation.isPending) return;
      outcomeRef.current = null;
      setInitialInput(inputValue);
      setIsOpen(true);
    },
    [dialogCreation]
  );

  const complete = React.useCallback(() => {
    outcomeRef.current = "complete";
    onComplete(initialInput);
    setIsOpen(false);
  }, [initialInput, onComplete]);

  const cancel = React.useCallback(() => {
    if (dialogCreation?.isPending) return;
    outcomeRef.current = "cancel";
    setIsOpen(false);
  }, [dialogCreation?.isPending]);

  const onOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) cancel();
    },
    [cancel]
  );

  const onCloseAutoFocus = React.useCallback(
    (event: Event) => {
      event.preventDefault();
      const outcome = outcomeRef.current;
      outcomeRef.current = null;
      if (outcome) onClosed(outcome);
    },
    [onClosed]
  );

  return {
    creation: dialogCreation,
    initialInput,
    isOpen,
    open,
    complete,
    cancel,
    onOpenChange,
    onCloseAutoFocus
  };
};

const ComboboxCreationDialog = <TOption,>({
  creation,
  initialInput,
  isOpen,
  complete,
  cancel,
  onOpenChange,
  onCloseAutoFocus
}: ComboboxCreationDialogProps<TOption>) => {
  if (!creation) return null;

  const preventPendingDismissal = (event: Event) => {
    if (creation.isPending) event.preventDefault();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={!creation.isPending}
        onEscapeKeyDown={preventPendingDismissal}
        onPointerDownOutside={preventPendingDismissal}
        onInteractOutside={preventPendingDismissal}
        onCloseAutoFocus={onCloseAutoFocus}
        onSubmit={(event) => event.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>{creation.title}</DialogTitle>
          <DialogDescription>{creation.description}</DialogDescription>
        </DialogHeader>
        {creation.renderForm({ initialInput, complete, cancel })}
      </DialogContent>
    </Dialog>
  );
};

const SingleCombobox = <TOption,>(props: ComboboxSingleProps<TOption>) => {
  const {
    options = [],
    value,
    onValueChange,
    getOptionValue,
    getOptionLabel,
    getOptionKeywords,
    getOptionGroup,
    isOptionDisabled,
    onSearchChange,
    listFooter,
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
    isClearable = true,
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
    onClick,
    onFocus,
    onKeyDown,
    ...inputProps
  } = props;
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const highlightedOptionValueRef = React.useRef<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const selectedLabel = value == null ? "" : getOptionLabel(value);
  const [search, setSearch] = React.useState("");
  const searchRef = React.useRef(search);
  searchRef.current = search;
  const isDialogCreationActiveRef = React.useRef(false);
  const [isEditing, setIsEditingState] = React.useState(false);
  const isEditingRef = React.useRef(isEditing);
  isEditingRef.current = isEditing;
  const setIsEditing = React.useCallback((nextIsEditing: boolean) => {
    isEditingRef.current = nextIsEditing;
    setIsEditingState(nextIsEditing);
  }, []);
  const selectedOptions = React.useMemo(() => (value == null ? [] : [value]), [value]);
  // A caller-owned search returns one already-filtered page after a debounce and a round trip.
  // The local matcher must not filter that page again, a selection missing from it is not a
  // match to list, and neither the initial highlight nor Enter may commit a row the user has
  // not seen yet.
  const isSearchOwnedByCaller = Boolean(onSearchChange);
  const isLocalFilterEnabled = shouldFilter && !isSearchOwnedByCaller;
  const items = useComboboxItems(
    options,
    selectedOptions,
    getOptionValue,
    includeMissingSelectedOptions && !isSearchOwnedByCaller
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
    () => items.filter((option) => !isLocalFilterEnabled || !isEditing || filter(option, search)),
    [filter, isEditing, isLocalFilterEnabled, items, search]
  );
  const selectableOptions = React.useMemo(
    () => visibleOptions.filter((option) => !isOptionDisabled?.(option)),
    [isOptionDisabled, visibleOptions]
  );
  const selectedValues = React.useMemo(
    () => new Set(value == null ? [] : [getOptionValue(value)]),
    [getOptionValue, value]
  );
  const updateSearch = (nextSearch: string) => {
    setSearch(nextSearch);
    onSearchChange?.(nextSearch);
    onInputValueChange?.(nextSearch);
  };
  const creationInput =
    creation && isEditing
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
      setIsEditing(false);
      setSearch("");
      onSearchChange?.("");
      onInputValueChange?.("");
    },
    [onInputValueChange, onSearchChange, setIsEditing]
  );
  const handleCreationDialogClosed = React.useCallback((outcome: "complete" | "cancel") => {
    if (outcome === "cancel") setOpen(true);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      isDialogCreationActiveRef.current = false;
    });
  }, []);
  const dialogCreation = useComboboxDialogCreation({
    creation,
    onComplete: handleCreationSuccess,
    onClosed: handleCreationDialogClosed
  });
  const {
    clearError: clearCreationError,
    create: createOption,
    creationError,
    isCreationActive,
    isCreationPending,
    pendingInputValue
  } = useComboboxCreation({
    creation: isInlineCreationConfig(creation) ? creation : undefined,
    onSuccess: handleCreationSuccess
  });
  const handleClear = () => {
    if (!isClearable) return;
    setIsEditing(false);
    updateSearch("");
    clearCreationError();
    clearSingleComboboxValue(props);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };
  const creationItem: ComboboxCreateItem | null = creation
    ? { type: "create", inputValue: pendingInputValue ?? (isEditing ? search.trim() : "") }
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
    <>
      <div data-slot="combobox-control" className="relative w-full">
        <ComboboxPrimitive.Root<ComboboxItem<TOption>, false>
          items={primitiveItems}
          value={selectedItem}
          onValueChange={(nextValue, eventDetails) => {
            if (nextValue == null) {
              if (eventDetails.reason === "clear-press") handleClear();
              return;
            }
            if (nextValue.type === "create") {
              eventDetails.cancel();
              if (!creationInput || nextValue.inputValue !== creationInput) return;
              if (dialogCreation.creation) {
                isDialogCreationActiveRef.current = true;
                setOpen(false);
                dialogCreation.open(creationInput);
              } else {
                createOption(creationInput);
              }
              return;
            }
            onValueChange(nextValue.option);
          }}
          open={open}
          onOpenChange={(nextOpen, eventDetails) => {
            if (
              !nextOpen &&
              eventDetails.reason === "outside-press" &&
              isComboboxTrailingSlotEvent(eventDetails.event)
            ) {
              eventDetails.cancel();
              return;
            }
            if (!nextOpen && isCreationActive() && eventDetails.reason === "item-press") {
              setOpen(true);
              return;
            }
            const isOpeningCreationDialog =
              !nextOpen &&
              eventDetails.reason === "item-press" &&
              isDialogCreationConfig(creation) &&
              (isDialogCreationActiveRef.current || isComboboxCreateItemEvent(eventDetails.event));
            setOpen(nextOpen);
            if (!nextOpen && !isCreationActive() && !isOpeningCreationDialog) {
              highlightedOptionValueRef.current = null;
              setIsEditing(false);
              updateSearch("");
              clearCreationError();
            }
          }}
          onItemHighlighted={(item) => {
            highlightedOptionValueRef.current =
              item?.type === "option" ? getOptionValue(item.option) : (item?.inputValue ?? null);
          }}
          inputValue={isEditing ? search : selectedLabel}
          onInputValueChange={(nextValue, eventDetails) => {
            if (eventDetails.reason === "input-change" || eventDetails.reason === "input-clear") {
              if (
                eventDetails.reason === "input-clear" &&
                (isCreationActive() || isDialogCreationActiveRef.current)
              )
                return;
              setIsEditing(eventDetails.reason === "input-change");
              updateSearch(nextValue);
              clearCreationError();
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
          filter={isLocalFilterEnabled && isEditing ? primitiveFilter : null}
          disabled={isDisabled}
          modal={modal}
          autoHighlight={!isSearchOwnedByCaller}
        >
          <div className="relative w-full">
            <ComboboxPrimitive.Input
              ref={inputRef}
              id={id}
              data-slot="combobox-input"
              data-invalid={isError}
              aria-invalid={isError || undefined}
              aria-busy={isLoading || isCreationPending || undefined}
              placeholder={placeholder}
              onClick={(event) => {
                onClick?.(event);
                if (!event.defaultPrevented && value != null && !isEditingRef.current) {
                  event.currentTarget.select();
                }
              }}
              onFocus={(event) => {
                onFocus?.(event);
                if (!event.defaultPrevented && value != null && !isEditingRef.current) {
                  event.currentTarget.select();
                }
              }}
              onKeyDown={(event) => {
                onKeyDown?.(event);

                if (
                  !event.defaultPrevented &&
                  value != null &&
                  !isEditingRef.current &&
                  ((event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) ||
                    event.key === "Backspace" ||
                    event.key === "Delete")
                ) {
                  setIsEditing(true);
                  setSearch("");
                }

                const hasHighlightedOption = highlightedOptionValueRef.current != null;
                if (
                  !event.defaultPrevented &&
                  event.key === "Enter" &&
                  open &&
                  !isLoading &&
                  !isSearchOwnedByCaller &&
                  !hasHighlightedOption &&
                  selectableOptions[0]
                ) {
                  onValueChange(selectableOptions[0]);
                  setOpen(false);
                  updateSearch("");
                }

                preventComboboxFormSubmit(event);
              }}
              className={cn(
                "h-9 w-full rounded-md border border-border bg-transparent py-2 pr-9 pl-2.5 text-sm text-foreground transition-[color,box-shadow] outline-none placeholder:text-muted",
                "hover:border-foreground/20 focus:border-ring focus:ring-[3px] focus:ring-ring/50",
                "data-[disabled]:pointer-events-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50 data-[invalid=true]:border-danger data-[invalid=true]:ring-danger/40",
                !isEditing && value != null && renderValue && "text-transparent",
                className
              )}
              {...inputProps}
            />
            {!isEditing && value != null && renderValue && (
              <span
                className={cn(
                  "pointer-events-none absolute inset-y-0 right-9 left-2.5 flex min-w-0 items-center truncate text-sm text-foreground",
                  isDisabled && "opacity-50"
                )}
              >
                {renderValue(value)}
              </span>
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
              emptyMessage={
                typeof emptyMessage === "function" ? emptyMessage(search) : emptyMessage
              }
              loadingMessage={loadingMessage}
              isLoading={isLoading}
              getOptionValue={getOptionValue}
              getOptionLabel={getOptionLabel}
              getOptionGroup={getOptionGroup}
              isOptionDisabled={isOptionDisabled}
              renderOption={renderOption}
              renderOptionIndicator={renderOptionIndicator}
              ariaLabel={`${searchAriaLabel} suggestions`}
              isEmpty={visibleOptions.length === 0}
              showEmptyMessage={!creation}
              creation={creation}
              creationItem={creationItem}
              canCreate={Boolean(creationInput)}
              creationError={creationError}
              isCreationPending={isCreationPending}
              selectedValues={selectedValues}
              maxHeight={SINGLE_LIST_MAX_HEIGHT}
            />
            {listFooter && <ComboboxListFooter>{listFooter}</ComboboxListFooter>}
          </ComboboxPopup>
        </ComboboxPrimitive.Root>
        <ComboboxTrailingSlot
          className="absolute top-1 right-1 z-10"
          isBusy={isLoading || isCreationPending}
          canClear={Boolean(
            isClearable && !isDisabled && (value != null || (isEditing && search.length > 0))
          )}
          clearAriaLabel={clearAriaLabel}
          onClear={handleClear}
        />
      </div>
      <ComboboxCreationDialog {...dialogCreation} />
    </>
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
  onSearchChange,
  listFooter,
  renderOption,
  renderOptionIndicator,
  renderValue,
  onClear,
  clearAriaLabel = "Clear all selections",
  singleLine = false,
  isSelectAll = false,
  isClearable = true,
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
  const isDialogCreationActiveRef = React.useRef(false);
  const selectedOptions = React.useMemo(() => [...value], [value]);
  // A caller-owned search returns one already-filtered page after a debounce and a round trip.
  // The local matcher must not filter that page again, a selection missing from it is not a
  // match to list, and the initial highlight may not land on a row the user has not seen yet.
  const isSearchOwnedByCaller = Boolean(onSearchChange);
  const isLocalFilterEnabled = shouldFilter && !isSearchOwnedByCaller;
  const items = useComboboxItems(
    options,
    selectedOptions,
    getOptionValue,
    includeMissingSelectedOptions && !isSearchOwnedByCaller
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
  const updateSearch = (nextSearch: string) => {
    setSearch(nextSearch);
    onSearchChange?.(nextSearch);
    onInputValueChange?.(nextSearch);
  };
  const visibleOptions = React.useMemo(
    () => items.filter((option) => !isLocalFilterEnabled || filter(option, search)),
    [filter, isLocalFilterEnabled, items, search]
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
      onSearchChange?.("");
      onInputValueChange?.("");
      if (openRef.current) window.requestAnimationFrame(() => inputRef.current?.focus());
    },
    [onInputValueChange, onSearchChange]
  );
  const handleCreationDialogClosed = React.useCallback((outcome: "complete" | "cancel") => {
    if (outcome === "cancel") {
      openRef.current = true;
      setOpen(true);
    }
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      isDialogCreationActiveRef.current = false;
    });
  }, []);
  const dialogCreation = useComboboxDialogCreation({
    creation,
    onComplete: handleCreationSuccess,
    onClosed: handleCreationDialogClosed
  });
  const {
    clearError: clearCreationError,
    create: createOption,
    creationError,
    isCreationActive,
    isCreationPending,
    pendingInputValue
  } = useComboboxCreation({
    creation: isInlineCreationConfig(creation) ? creation : undefined,
    onSuccess: handleCreationSuccess
  });
  const handleClear = () => {
    if (!isClearable) return;
    updateSearch("");
    clearCreationError();
    if (onClear) onClear();
    else onValueChange([]);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };
  const creationItem: ComboboxCreateItem | null = creation
    ? { type: "create", inputValue: pendingInputValue ?? search.trim() }
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
    <>
      <div data-slot="combobox-control" className="relative w-full">
        <ComboboxPrimitive.Root<ComboboxItem<TOption>, true>
          multiple
          items={primitiveItems}
          value={selectedItems}
          onValueChange={(nextValue, eventDetails) => {
            const createItem = nextValue.find((item) => item.type === "create");
            if (createItem) {
              eventDetails.cancel();
              if (!creationInput || createItem.inputValue !== creationInput) return;
              if (dialogCreation.creation) {
                isDialogCreationActiveRef.current = true;
                openRef.current = false;
                setOpen(false);
                dialogCreation.open(creationInput);
              } else {
                createOption(creationInput);
              }
              return;
            }

            if (eventDetails.reason === "item-press") {
              eventDetails.cancel();
              updateSearch("");
              setOpen(true);
              window.requestAnimationFrame(() => inputRef.current?.focus());
            }

            if (eventDetails.reason === "clear-press") {
              handleClear();
              return;
            }

            onValueChange(
              nextValue.flatMap((item) => (item.type === "option" ? [item.option] : []))
            );
          }}
          open={open}
          onOpenChange={(nextOpen, eventDetails) => {
            if (
              !nextOpen &&
              eventDetails.reason === "outside-press" &&
              isComboboxTrailingSlotEvent(eventDetails.event)
            ) {
              eventDetails.cancel();
              return;
            }
            if (!nextOpen && isCreationActive() && eventDetails.reason === "item-press") {
              openRef.current = true;
              setOpen(true);
              return;
            }
            const isOpeningCreationDialog =
              !nextOpen &&
              eventDetails.reason === "item-press" &&
              isDialogCreationConfig(creation) &&
              (isDialogCreationActiveRef.current || isComboboxCreateItemEvent(eventDetails.event));
            openRef.current = nextOpen;
            setOpen(nextOpen);
            if (!nextOpen && !isCreationActive() && !isOpeningCreationDialog) {
              updateSearch("");
              clearCreationError();
            }
          }}
          inputValue={search}
          onInputValueChange={(nextValue, eventDetails) => {
            if (
              eventDetails.reason === "input-clear" &&
              (isCreationActive() || isDialogCreationActiveRef.current)
            )
              return;
            setSearch(nextValue);
            if (eventDetails.reason === "input-change" || eventDetails.reason === "input-clear") {
              clearCreationError();
              onSearchChange?.(nextValue);
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
          filter={isLocalFilterEnabled ? primitiveFilter : null}
          disabled={isDisabled}
          modal={modal}
          autoHighlight={!isSearchOwnedByCaller}
        >
          <ComboboxPrimitive.Chips
            ref={chipsRef}
            data-slot="combobox-chips"
            data-disabled={isDisabled ? "" : undefined}
            data-invalid={isError}
            className={cn(
              COMBOBOX_CHIPS_CLASS,
              singleLine ? "items-center" : "items-start",
              value.length > 0 ? "p-1 pr-8" : "py-1 pr-8 pl-2.5",
              className
            )}
          >
            <div
              className={comboboxChipsViewportClass(singleLine)}
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
                          className={COMBOBOX_CHIP_CLASS}
                        >
                          <span className={COMBOBOX_CHIP_LABEL_CLASS}>
                            {renderValue?.(option) ?? label}
                          </span>
                          {!isDisabled && (
                            <ComboboxPrimitive.ChipRemove
                              aria-label={`Remove ${label}`}
                              className={COMBOBOX_CHIP_REMOVE_CLASS}
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
                className={COMBOBOX_CHIPS_INPUT_CLASS}
                {...inputProps}
              />
            </div>
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
              emptyMessage={
                typeof emptyMessage === "function" ? emptyMessage(search) : emptyMessage
              }
              loadingMessage={loadingMessage}
              isLoading={isLoading}
              getOptionValue={getOptionValue}
              getOptionLabel={getOptionLabel}
              getOptionGroup={getOptionGroup}
              isOptionDisabled={isOptionDisabled}
              renderOption={renderOption}
              renderOptionIndicator={renderOptionIndicator}
              ariaLabel={`${searchAriaLabel} suggestions`}
              isEmpty={visibleOptions.length === 0}
              showEmptyMessage={!creation}
              creation={creation}
              creationItem={creationItem}
              canCreate={Boolean(creationInput)}
              creationError={creationError}
              isCreationPending={isCreationPending}
              selectedValues={selectedValues}
              maxHeight={MULTIPLE_LIST_MAX_HEIGHT}
            />
            {listFooter && <ComboboxListFooter>{listFooter}</ComboboxListFooter>}
          </ComboboxPopup>
        </ComboboxPrimitive.Root>
        <ComboboxTrailingSlot
          className="absolute top-1 right-1 z-10"
          isBusy={isLoading || isCreationPending}
          canClear={isClearable && !isDisabled && (value.length > 0 || search.length > 0)}
          clearAriaLabel={clearAriaLabel}
          onClear={handleClear}
        />
      </div>
      <ComboboxCreationDialog {...dialogCreation} />
    </>
  );
};

/**
 * Searchable object select built on Base UI. Use `multiple` for the chips-based
 * multi-select contract while legacy `FilterableSelect` consumers migrate incrementally.
 * Options are filtered in the browser unless `onSearchChange` is passed, which hands
 * filtering to the caller so the list can be fetched a page at a time.
 */
function Combobox<TOption>(props: ComboboxMultipleProps<TOption>): React.ReactElement;
function Combobox<TOption>(
  props: ComboboxSharedProps<TOption> &
    ComboboxInputProps &
    ComboboxSingleOverrideClearProps<TOption>
): React.ReactElement;
function Combobox<TOption>(
  props: ComboboxSharedProps<TOption> &
    ComboboxInputProps &
    ComboboxSingleNonClearableProps<TOption>
): React.ReactElement;
function Combobox<TOption>(
  props: ComboboxSharedProps<TOption> &
    ComboboxInputProps &
    ComboboxSingleDefaultClearProps<TOption>
): React.ReactElement;
function Combobox<TOption>(props: ComboboxProps<TOption>) {
  const { multiple } = props;
  if (multiple) return <MultipleCombobox {...props} />;
  return <SingleCombobox {...props} />;
}

export {
  Combobox,
  type ComboboxCreationConfig,
  type ComboboxDialogCreationConfig,
  type ComboboxDialogCreationRenderProps,
  type ComboboxInlineCreationConfig,
  type ComboboxMultipleProps,
  type ComboboxProps,
  type ComboboxRenderOptionState,
  type ComboboxSingleProps
};
