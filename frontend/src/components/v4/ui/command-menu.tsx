import * as React from "react";

import { useControllableState } from "../lib/use-controllable-state";
import { cn } from "../lib/utils";
import { Button } from "./button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut
} from "./command";
import { Icon, type IconName } from "./icon";
import { Kbd } from "./kbd";
import { Spinner } from "./spinner";

import menu from "./menu.module.css";
import styles from "./picker.module.css";

export type CommandMenuItem = {
  id: string;
  label: string;
  icon?: IconName;
  media?: React.ReactNode;
  description?: string;
  meta?: string;
  shortcut?: string;
  keywords?: string[];
  mono?: boolean;
  href?: string;
  onSelect?: () => void | Promise<void>;
  page?: string;
  disabled?: boolean;
  keepOpen?: boolean;
  danger?: boolean;
};
export type CommandMenuGroup = {
  label: string;
  items: readonly CommandMenuItem[];
  meta?: string;
  limit?: number;
  searchOnly?: boolean;
};
export type CommandMenuProps = {
  groups: readonly CommandMenuGroup[];
  recent?: readonly CommandMenuItem[];
  pages?: Record<
    string,
    { title: string; placeholder?: string; groups: readonly CommandMenuGroup[] }
  >;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  hotkey?: "mod+k" | false;
  onQueryChange?: (query: string, pageId?: string) => void;
  loading?: boolean;
  filter?: boolean;
  emptyHint?: string;
  footer?: React.ReactNode;
  inline?: boolean;
  label?: string;
};
export const CommandMenu = ({
  groups,
  recent = [],
  pages = {},
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  hotkey = "mod+k",
  onQueryChange,
  loading = false,
  filter = true,
  emptyHint,
  footer,
  inline = false,
  label = "Search workspace"
}: CommandMenuProps) => {
  const [open, setOpen] = useControllableState({
    value: controlledOpen,
    defaultValue: defaultOpen,
    onChange: onOpenChange
  });
  const [query, setQuery] = React.useState("");
  const [path, setPath] = React.useState<string[]>([]);
  const [active, setActive] = React.useState("");
  const [error, setError] = React.useState("");
  const epoch = React.useRef(0);
  const mounted = React.useRef(true);
  const inFlight = React.useRef(new Set<string>());
  const [pendingActions, setPendingActions] = React.useState<readonly string[]>([]);
  const previousOpen = React.useRef(open);
  const queryListener = React.useRef(onQueryChange);
  queryListener.current = onQueryChange;
  React.useLayoutEffect(() => {
    if (previousOpen.current !== open) epoch.current += 1;
    if (previousOpen.current && !open && !inline) {
      setPath([]);
      setQuery("");
      setActive("");
      setError("");
      queryListener.current?.("", undefined);
    }
    previousOpen.current = open;
  }, [inline, open]);
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      epoch.current += 1;
    };
  }, []);
  const pageId = path[path.length - 1];
  const page = pageId ? pages[pageId] : undefined;
  const updateQuery = (next: string) => {
    epoch.current += 1;
    setQuery(next);
    setError("");
    onQueryChange?.(next, pageId);
  };
  const back = () => {
    epoch.current += 1;
    setError("");
    setPath((previous) => previous.slice(0, -1));
    setQuery("");
    onQueryChange?.("", path[path.length - 2]);
  };
  React.useEffect(() => {
    if (!hotkey || inline) return;
    const listener = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat) return;
      if (
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "k"
      ) {
        event.preventDefault();
        setOpen(!open);
      }
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [hotkey, inline, open, setOpen]);
  const visibleGroups = page?.groups ?? groups;
  const allGroups =
    !page && !query && recent.length
      ? [{ label: "Recent", items: recent }, ...visibleGroups]
      : visibleGroups;
  const rank = (item: CommandMenuItem) => {
    const q = query.trim().toLowerCase();
    const text = item.label.toLowerCase();
    if (!q) return 1;
    if (text.startsWith(q)) return 4;
    if (text.split(/[\s_\-./:]+/).some((word) => word.startsWith(q))) return 3;
    if (text.includes(q)) return 2;
    return [item.description, ...(item.keywords ?? [])].some((value) =>
      value?.toLowerCase().includes(q)
    )
      ? 1
      : 0;
  };
  const selectedItem = allGroups.flatMap((group) => group.items).find((item) => item.id === active);
  const activate = async (item: CommandMenuItem) => {
    if (item.disabled || inFlight.current.has(item.id)) return;
    if (item.page) {
      const nextPage = item.page;
      if (!pages[nextPage]) {
        setError("This command page is unavailable.");
        return;
      }
      epoch.current += 1;
      setPath((previous) => [...previous, nextPage]);
      setQuery("");
      onQueryChange?.("", nextPage);
      return;
    }
    const turn = epoch.current;
    inFlight.current.add(item.id);
    setPendingActions([...inFlight.current]);
    setError("");
    try {
      await item.onSelect?.();
      if (turn !== epoch.current) return;
      if (item.href) window.location.assign(item.href);
      if (!item.keepOpen) setOpen(false);
    } catch (cause) {
      if (turn !== epoch.current || (cause instanceof DOMException && cause.name === "AbortError"))
        return;
      setError(`Could not ${item.label.toLowerCase()}. Try again.`);
    } finally {
      inFlight.current.delete(item.id);
      if (mounted.current) setPendingActions([...inFlight.current]);
    }
  };
  const markLabel = (text: string) => {
    const index = text.toLowerCase().indexOf(query.toLowerCase());
    return !query || index < 0 ? (
      text
    ) : (
      <>
        {text.slice(0, index)}
        <mark className={styles.match}>{text.slice(index, index + query.length)}</mark>
        {text.slice(index + query.length)}
      </>
    );
  };

  const panel = (
    <Command
      label={label}
      shouldFilter={false}
      loop
      value={active}
      onValueChange={setActive}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
        if (inline && event.key === "Escape" && path.length) {
          event.preventDefault();
          event.stopPropagation();
          back();
        }
        if (event.key === "Backspace" && !query && path.length) {
          event.preventDefault();
          back();
        }
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && selectedItem?.href) {
          event.preventDefault();
          if (selectedItem.disabled || inFlight.current.has(selectedItem.id)) return;
          window.open(selectedItem.href, "_blank", "noopener,noreferrer");
        }
      }}
    >
      <div className={styles.commandSearch}>
        {page && (
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Back" onClick={back}>
            <Icon name="chev-left" />
          </Button>
        )}
        <CommandInput
          value={query}
          onValueChange={updateQuery}
          placeholder={page?.placeholder ?? label}
          aria-label={page?.title ?? label}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing || event.keyCode === 229) event.stopPropagation();
          }}
          trailing={loading && <Spinner />}
        />
      </div>
      <CommandEmpty>
        <p role="status">
          {loading ? "Searching…" : `No results${query ? ` for "${query}"` : ""}`}
        </p>
        {emptyHint && <p>{emptyHint}</p>}
      </CommandEmpty>
      <CommandList>
        {allGroups
          .filter((group) => !group.searchOnly || query)
          .map((group) => {
            const items = group.items
              .map((item, index) => ({ item, score: rank(item), index }))
              .filter(({ score }) => !filter || score > 0)
              .sort((a, b) => (filter ? b.score - a.score || a.index - b.index : a.index - b.index))
              .slice(0, query && group.limit ? group.limit : undefined);
            return items.length ? (
              <CommandGroup key={group.label} heading={group.label}>
                {items.map(({ item }) => (
                  <CommandItem
                    key={item.id}
                    value={item.id}
                    disabled={item.disabled || pendingActions.includes(item.id)}
                    aria-busy={pendingActions.includes(item.id) || undefined}
                    data-danger={item.danger || undefined}
                    onSelect={() => {
                      activate(item);
                    }}
                  >
                    {item.media ? (
                      <span data-menu-icon="">{item.media}</span>
                    ) : (
                      item.icon && <Icon name={item.icon} />
                    )}
                    <span data-command-label className={menu.text}>
                      <span className={cn(menu.title, item.mono && styles.mono)}>
                        {markLabel(item.label)}
                      </span>
                      {item.description && (
                        <span className={menu.description}>{item.description}</span>
                      )}
                    </span>
                    {item.meta && <span className={menu.meta}>{item.meta}</span>}
                    {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null;
          })}
      </CommandList>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={menu.hints} data-slot="command-menu-hints">
        <span className={menu.hint}>
          <Kbd size="sm" keys={["up"]} />
          <Kbd size="sm" keys={["down"]} />
          Navigate
        </span>
        <span className={menu.hint}>
          <Kbd size="sm" keys="enter" />
          Open
        </span>
        <span className={menu.hint}>
          <Kbd size="sm" keys="esc" />
          {page ? "Back" : "Close"}
        </span>
        {footer && <span className={menu.hintsExtra}>{footer}</span>}
      </div>
    </Command>
  );
  return inline ? (
    panel
  ) : (
    <CommandDialog
      onEscapeKeyDown={(event) => {
        if (path.length) {
          event.preventDefault();
          back();
        }
      }}
      open={open}
      onOpenChange={setOpen}
      title={label}
      description="Search pages, objects and actions"
    >
      {panel}
    </CommandDialog>
  );
};
