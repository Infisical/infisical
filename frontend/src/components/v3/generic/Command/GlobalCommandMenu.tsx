import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon, CornerDownLeftIcon } from "lucide-react";

import { cn } from "../../utils";
import { Kbd } from "../Kbd";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut
} from "./Command";

const APPLE_PLATFORM_PATTERN = /Mac|iPhone|iPad|iPod/i;
const SHORTCUT_EXCLUSION_SELECTOR =
  '[data-command-menu-shortcut="ignore"], [contenteditable]:not([contenteditable="false"]), .cm-editor, .monaco-editor, .xterm';

export type GlobalCommandMenuItem = {
  id: string;
  label: string;
  breadcrumb: string;
  icon?: LucideIcon;
  keywords?: string[];
  shortcut?: React.ReactNode;
  priority?: number;
  isDisabled?: boolean;
  onSelect?: () => void;
  children?: GlobalCommandMenuGroup[];
  drilldownPlaceholder?: string;
};

export type GlobalCommandMenuGroup = {
  heading?: string;
  items: GlobalCommandMenuItem[];
};

export type GlobalCommandMenuProps = {
  groups: GlobalCommandMenuGroup[];
  searchGroups?: GlobalCommandMenuGroup[];
  isEnabled?: boolean;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: string;
  description?: string;
  placeholder?: string;
  emptyMessage?: string;
  className?: string;
};

const usesAppleCommandKey = () => {
  if (typeof navigator === "undefined") return false;
  return APPLE_PLATFORM_PATTERN.test(`${navigator.platform} ${navigator.userAgent}`);
};

const isGlobalCommandShortcut = (event: KeyboardEvent) => {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.repeat ||
    event.key.toLowerCase() !== "k" ||
    event.altKey ||
    event.shiftKey
  ) {
    return false;
  }

  return usesAppleCommandKey() ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
};

const getSearchScore = (item: GlobalCommandMenuItem, search: string) => {
  const query = search.trim().toLowerCase();
  if (!query) return item.priority ?? 0;

  const label = item.label.toLowerCase();
  const breadcrumb = item.breadcrumb.toLowerCase();
  const keywords = item.keywords?.map((keyword) => keyword.toLowerCase()) ?? [];
  let relevance = -1;

  if (label === query) relevance = 100;
  else if (label.startsWith(query)) relevance = 80;
  else if (label.includes(query)) relevance = 60;
  else if (keywords.some((keyword) => keyword.startsWith(query))) relevance = 50;
  else if (keywords.some((keyword) => keyword.includes(query))) relevance = 40;
  else if (breadcrumb.includes(query)) relevance = 30;

  return relevance < 0 ? relevance : relevance + (item.priority ?? 0);
};

const filterGroups = (groups: GlobalCommandMenuGroup[], search: string) =>
  groups
    .map((group) => ({
      ...group,
      items: group.items
        .map((item) => ({ item, score: getSearchScore(item, search) }))
        .filter(({ score }) => score >= 0)
        .sort((a, b) => b.score - a.score)
        .map(({ item }) => item)
    }))
    .filter(({ items }) => items.length > 0);

const flattenSearchGroups = (
  groups: GlobalCommandMenuGroup[],
  search: string
): GlobalCommandMenuGroup[] => [
  {
    items: [
      ...new Map(groups.flatMap((group) => group.items).map((item) => [item.id, item])).values()
    ]
      .map((item) => ({ item, score: getSearchScore(item, search) }))
      .filter(({ score }) => score >= 0)
      .sort((a, b) => b.score - a.score)
      .map(({ item }) => item)
  }
];

const CommandResult = ({ item }: { item: GlobalCommandMenuItem }) => {
  const Icon = item.icon;

  return (
    <>
      {Icon && (
        <div className="flex aspect-square size-8 shrink-0 items-center justify-center">
          <Icon aria-hidden="true" className="size-4" />
        </div>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-foreground">{item.label}</span>
        <span className="block truncate text-xs text-muted">{item.breadcrumb}</span>
      </span>
      {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
      {item.children && <ChevronRightIcon aria-hidden="true" className="ml-auto size-4" />}
    </>
  );
};

export const GlobalCommandMenu = ({
  groups,
  searchGroups = groups,
  isEnabled = true,
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  title = "Command Menu",
  description = "Search available commands.",
  placeholder = "Search commands...",
  emptyMessage = "No commands found.",
  className
}: GlobalCommandMenuProps) => {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  const [search, setSearch] = React.useState("");
  const [drilldown, setDrilldown] = React.useState<GlobalCommandMenuItem[]>([]);
  const open = controlledOpen ?? uncontrolledOpen;
  const openRef = React.useRef(open);
  const invokerRef = React.useRef<HTMLElement | null>(null);
  const activeDrilldown = drilldown.at(-1);
  let mode = "browse";
  if (search.trim()) mode = "search";
  if (activeDrilldown) mode = "drill-down";

  React.useEffect(() => {
    openRef.current = open;
  }, [open]);

  const resetMenu = React.useCallback(() => {
    setSearch("");
    setDrilldown([]);
  }, []);

  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      openRef.current = nextOpen;
      if (controlledOpen === undefined) setUncontrolledOpen(nextOpen);
      if (!nextOpen) resetMenu();
      onOpenChange?.(nextOpen);
    },
    [controlledOpen, onOpenChange, resetMenu]
  );

  React.useEffect(() => {
    if (!isEnabled) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isGlobalCommandShortcut(event)) return;

      const { target } = event;
      if (target instanceof Element && target.closest(SHORTCUT_EXCLUSION_SELECTOR)) return;

      event.preventDefault();
      event.stopPropagation();
      setOpen(!openRef.current);
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isEnabled, setOpen]);

  const goBack = () => {
    setSearch("");
    setDrilldown((current) => current.slice(0, -1));
  };

  const visibleGroups = React.useMemo(() => {
    if (activeDrilldown?.children) return filterGroups(activeDrilldown.children, search);
    if (mode === "search") return flattenSearchGroups([...groups, ...searchGroups], search);
    return groups.filter(({ items }) => items.length > 0);
  }, [activeDrilldown, groups, mode, search, searchGroups]);

  const visibleItems = visibleGroups.flatMap((group) => group.items);
  const resultCount = visibleItems.length;
  const inputPlaceholder = activeDrilldown?.drilldownPlaceholder ?? placeholder;

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={title}
      description={description}
      className={cn("top-[12%] max-w-xl origin-top translate-y-0", className)}
      loop
      shouldFilter={false}
      showCloseButton={false}
      contentProps={{
        onOpenAutoFocus: () => {
          invokerRef.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;
        },
        onCloseAutoFocus: (event) => {
          event.preventDefault();

          const invoker = invokerRef.current;
          invokerRef.current = null;
          if (invoker?.isConnected) invoker.focus();
        },
        onKeyDownCapture: (event) => {
          if (event.key === "ArrowLeft" && !search && activeDrilldown) {
            event.preventDefault();
            event.stopPropagation();
            goBack();
          }
        }
      }}
    >
      <CommandInput
        aria-label={activeDrilldown ? `${activeDrilldown.label}: ${inputPlaceholder}` : title}
        className="h-14"
        placeholder={inputPlaceholder}
        value={search}
        onValueChange={setSearch}
        startAdornment={
          activeDrilldown ? (
            <button
              type="button"
              aria-label="Back to previous commands"
              className="-ml-1 flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted outline-none hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              onClick={goBack}
            >
              <ChevronLeftIcon aria-hidden="true" className="size-4" />
            </button>
          ) : undefined
        }
      />
      <CommandList
        key={`${activeDrilldown?.id ?? "root"}-${mode}`}
        className="max-h-[min(420px,60vh)] p-1"
      >
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
          {resultCount === 0
            ? emptyMessage
            : `${resultCount} ${resultCount === 1 ? "result" : "results"}`}
        </div>
        {resultCount === 0 && (
          <CommandEmpty className="flex min-h-12 items-center justify-center">
            {emptyMessage}
          </CommandEmpty>
        )}
        {resultCount > 0 && (
          <CommandGroup>
            {visibleItems.map((item) => (
              <CommandItem
                key={item.id}
                value={item.id}
                keywords={[item.label, item.breadcrumb, ...(item.keywords ?? [])]}
                disabled={item.isDisabled}
                className="min-h-14"
                onSelect={() => {
                  if (item.children) {
                    setSearch("");
                    setDrilldown((current) => [...current, item]);
                    return;
                  }

                  setOpen(false);
                  item.onSelect?.();
                }}
              >
                <CommandResult item={item} />
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
      <div className="flex items-center justify-end gap-4 border-t border-border px-3 py-2 text-[11px] text-muted">
        {activeDrilldown && (
          <div className="flex items-center gap-1.5">
            <Kbd>
              <ArrowLeftIcon aria-hidden="true" className="size-3" />
            </Kbd>
            <span>Back</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <Kbd>
            <CornerDownLeftIcon aria-hidden="true" className="size-3" />
          </Kbd>
          <span>Select</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Kbd>Esc</Kbd>
          <span>Close</span>
        </div>
      </div>
    </CommandDialog>
  );
};
