import * as React from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "lucide-react";

import { type PresenceReport, usePresenceCount, useReportPresence } from "../lib/presence-count";
import { v4Themes } from "../lib/theme-registry";
import { cn } from "../lib/utils";
import { useV4ActionBarReserve } from "../scope";
import { Count } from "./badge";
import { BandDivider, Breadcrumb, type BreadcrumbCrumb } from "./breadcrumb";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "./dropdown-menu";
import { Icon, type IconName } from "./icon";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./sheet";
import { Toaster } from "./sonner";
import { ToggleGroup, ToggleGroupItem } from "./toggle-group";
import { Tooltip, TooltipProvider } from "./tooltip";

import styles from "./top-bar.module.css";

export type ShellMode = "wide" | "rail" | "narrow";
/** "system", or a theme id from tokens.json themes. */
export type ShellTheme = string;
export interface ShellMenuItem {
  label: string;
  icon?: IconName | LucideIcon;
  href?: string;
  external?: boolean;
  onSelect?: () => void;
  disabled?: boolean;
  disabledReason?: string;
}
export type ShellMenuEntry = ShellMenuItem | { type: "separator" };
export type ShellSheetSlot = "org" | "switchers" | "account" | "icons";

type ShellState = {
  mode: ShellMode;
  narrow: boolean;
  hasNavigation: boolean;
  setHasNavigation: (value: boolean) => void;
  navigationOpen: boolean;
  setNavigationOpen: (open: boolean) => void;
  navigationTrigger: React.RefObject<HTMLButtonElement | null>;
  navigationToggle: React.RefObject<(() => void) | null>;
  toggleNavigation: () => void;
  navigationUnread: boolean;
  setNavigationUnread: (value: boolean) => void;
  slots: Partial<Record<ShellSheetSlot, HTMLElement | null>>;
  setSlot: (slot: ShellSheetSlot, node: HTMLElement | null) => void;
};

const ShellContext = React.createContext<ShellState | null>(null);

export const useAppShell = () => React.useContext(ShellContext);

type ShellChrome = Record<"topBar" | "sidebar" | "sidebarOpen", PresenceReport>;
const ShellChromeContext = React.createContext<ShellChrome | null>(null);
/** A TopBar or inline Sidebar tells its AppShell it is there, which sets the inset's margins. */
export const useShellChrome = () => React.useContext(ShellChromeContext);

const InsetReserveContext = React.createContext<PresenceReport | null>(null);
/** Pads AppInset by the floating action bar's height, and lifts the scope's toasts above it, while active holds. */
export const useActionBarReserve = (active: boolean) => {
  useReportPresence(React.useContext(InsetReserveContext), active);
  useReportPresence(useV4ActionBarReserve(), active);
};

const sizeOf = (element: HTMLElement, token: string) =>
  parseFloat(getComputedStyle(element).getPropertyValue(token)) || 0;

const shellSelector = '[data-slot="app-shell"]';
const typingSelector =
  'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], .cm-editor, .monaco-editor';
let lastPointerTarget: Element | null = null;
const rememberPointer = (event: PointerEvent) => {
  lastPointerTarget = event.target instanceof Element ? event.target : null;
};
let pointerWatchers = 0;
const watchPointer = () => {
  pointerWatchers += 1;
  if (pointerWatchers === 1) document.addEventListener("pointerdown", rememberPointer, true);
  return () => {
    pointerWatchers -= 1;
    if (pointerWatchers === 0) document.removeEventListener("pointerdown", rememberPointer, true);
  };
};

const isNavigationShortcut = (event: KeyboardEvent) => {
  const apple = /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
  return (
    (apple ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "b"
  );
};

const ownsShortcut = (shell: HTMLElement, event: KeyboardEvent) => {
  const focused = event.target instanceof Element ? event.target : null;
  const target =
    !focused ||
    focused === document.body ||
    (lastPointerTarget && focused.contains(lastPointerTarget))
      ? lastPointerTarget
      : focused;
  if (target?.closest(`${typingSelector}, [role="dialog"]`)) return false;
  const owner = target?.isConnected ? target.closest(shellSelector) : null;
  if (owner) return owner === shell;
  return document.querySelector(shellSelector) === shell;
};

export function AppShell({
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & { ref?: React.Ref<HTMLDivElement> }) {
  const own = React.useRef<HTMLDivElement>(null);
  const [mode, setMode] = React.useState<ShellMode>("wide");
  const [hasNavigation, setHasNavigation] = React.useState(false);
  const [navigationOpen, setNavigationOpen] = React.useState(false);
  const [navigationUnread, setNavigationUnread] = React.useState(false);
  const [slots, setSlots] = React.useState<ShellState["slots"]>({});
  const setSlot = React.useCallback(
    (slot: ShellSheetSlot, node: HTMLElement | null) =>
      setSlots((previous) => (previous[slot] === node ? previous : { ...previous, [slot]: node })),
    []
  );
  const navigationTrigger = React.useRef<HTMLButtonElement>(null);
  const navigationToggle = React.useRef<(() => void) | null>(null);
  const toggleNavigation = React.useCallback(() => navigationToggle.current?.(), []);
  const [hasTopBar, reportTopBar] = usePresenceCount();
  const [hasSidebar, reportSidebar] = usePresenceCount();
  const [sidebarOpen, reportSidebarOpen] = usePresenceCount();
  const chrome = React.useMemo(
    () => ({ topBar: reportTopBar, sidebar: reportSidebar, sidebarOpen: reportSidebarOpen }),
    [reportTopBar, reportSidebar, reportSidebarOpen]
  );
  const sheetOpen = React.useRef(false);
  React.useEffect(() => {
    sheetOpen.current = navigationOpen;
  }, [navigationOpen]);
  React.useImperativeHandle(ref, () => own.current as HTMLDivElement);
  React.useLayoutEffect(() => {
    const element = own.current;
    if (!element) return undefined;
    const measure = () => {
      const width = element.offsetWidth;
      let next: ShellMode = "wide";
      if (width < sizeOf(element, "--v4-size-shell-collapse")) next = "narrow";
      else if (width < sizeOf(element, "--v4-size-shell-rail")) next = "rail";
      setMode(next);
      if (next === "wide") setNavigationOpen(false);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  React.useEffect(() => {
    const element = own.current;
    if (!element) return undefined;
    const listener = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat) return;
      if (!isNavigationShortcut(event) || !navigationToggle.current) return;
      if (!sheetOpen.current && !ownsShortcut(element, event)) return;
      event.preventDefault();
      navigationToggle.current();
    };
    const unwatch = watchPointer();
    document.addEventListener("keydown", listener);
    return () => {
      unwatch();
      document.removeEventListener("keydown", listener);
    };
  }, []);
  const value = React.useMemo(
    () => ({
      mode,
      narrow: mode === "narrow",
      hasNavigation,
      setHasNavigation,
      navigationOpen,
      setNavigationOpen,
      navigationTrigger,
      navigationToggle,
      toggleNavigation,
      navigationUnread,
      setNavigationUnread,
      slots,
      setSlot
    }),
    [mode, hasNavigation, navigationOpen, toggleNavigation, navigationUnread, slots, setSlot]
  );
  return (
    <ShellContext value={value}>
      <ShellChromeContext value={chrome}>
        <div
          ref={own}
          data-slot="app-shell"
          data-mode={mode}
          data-narrow={mode === "narrow" || undefined}
          data-has-top-bar={hasTopBar || undefined}
          data-has-sidebar={hasSidebar || undefined}
          data-sidebar-open={sidebarOpen || undefined}
          className={cn(styles.shell, className)}
          {...props}
        />
      </ShellChromeContext>
      <Toaster />
    </ShellContext>
  );
}
AppShell.displayName = "AppShell";

export function AppInset({
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"main"> & { ref?: React.Ref<HTMLElement> }) {
  const [reserve, reportReserve] = usePresenceCount();
  return (
    <InsetReserveContext value={reportReserve}>
      <main
        ref={ref}
        data-slot="app-inset"
        data-action-bar-reserve={reserve || undefined}
        className={cn(styles.inset, className)}
        {...props}
      />
    </InsetReserveContext>
  );
}
AppInset.displayName = "AppInset";

export const scrollInsetTo = (target: HTMLElement) => {
  const inset = target.closest<HTMLElement>('[data-slot="app-inset"]');
  if (!inset) {
    target.scrollIntoView({ block: "start" });
    return;
  }
  const offset = parseFloat(getComputedStyle(inset).scrollPaddingTop) || 0;
  inset.scrollTo({
    top:
      inset.scrollTop +
      target.getBoundingClientRect().top -
      inset.getBoundingClientRect().top -
      offset
  });
};

export function PageGutter({
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} data-slot="page-gutter" className={cn(styles.gutter, className)} {...props} />
  );
}
PageGutter.displayName = "PageGutter";

const glyph = (icon: IconName | LucideIcon, size?: number) =>
  typeof icon === "string" ? (
    <Icon key="icon" name={icon} size={size} />
  ) : (
    <Icon key="icon" icon={icon} size={size} />
  );

const itemContent = (item: ShellMenuItem) => [
  item.icon && glyph(item.icon),
  item.label,
  item.external && <Icon key="external" name="external" size={14} className={styles.menuEnd} />
];

export const ShellMenuItems = ({ entries }: { entries: readonly ShellMenuEntry[] }) =>
  entries.map((entry, index) =>
    "type" in entry ? (
      <DropdownMenuSeparator key={index} />
    ) : (
      <DropdownMenuItem
        key={index}
        disabled={entry.disabled}
        description={entry.disabled ? entry.disabledReason : undefined}
        onSelect={entry.onSelect}
        asChild={Boolean(entry.href) && !entry.disabled}
      >
        {entry.href && !entry.disabled ? (
          <a
            href={entry.href}
            target={entry.external ? "_blank" : undefined}
            rel={entry.external ? "noreferrer" : undefined}
          >
            {itemContent(entry)}
          </a>
        ) : (
          itemContent(entry)
        )}
      </DropdownMenuItem>
    )
  );

export const ShellSheetRows = ({
  entries,
  onDone
}: {
  entries: readonly ShellMenuEntry[];
  onDone: () => void;
}) =>
  entries.map((entry, index) => {
    if ("type" in entry) return <span key={index} role="separator" className={styles.sheetRule} />;
    const content = (
      <>
        {entry.icon && glyph(entry.icon, 18)}
        <span className={styles.sheetRowText}>
          {entry.label}
          {entry.disabled && entry.disabledReason && (
            <span className={styles.sheetRowMeta}>{entry.disabledReason}</span>
          )}
        </span>
        {entry.external && <Icon name="external" size={14} className={styles.menuEnd} />}
      </>
    );
    if (entry.href && !entry.disabled)
      return (
        <a
          key={index}
          className={styles.sheetRow}
          href={entry.href}
          target={entry.external ? "_blank" : undefined}
          rel={entry.external ? "noreferrer" : undefined}
          onClick={() => {
            entry.onSelect?.();
            onDone();
          }}
        >
          {content}
        </a>
      );
    return (
      <button
        key={index}
        type="button"
        className={styles.sheetRow}
        disabled={entry.disabled}
        onClick={() => {
          entry.onSelect?.();
          onDone();
        }}
      >
        {content}
      </button>
    );
  });

export const ShellBottomSheet = ({
  title,
  open,
  onOpenChange,
  children
}: {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) => (
  <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="bottom" aria-describedby={undefined} className={styles.bottomSheet}>
      <SheetHeader>
        <SheetTitle>{title}</SheetTitle>
      </SheetHeader>
      <div className={styles.sheetRows}>{children}</div>
    </SheetContent>
  </Sheet>
);

const themeOptions: { value: ShellTheme; label: string }[] = [
  { value: "system", label: "System" },
  ...v4Themes.map((theme) => ({ value: theme.id, label: theme.name }))
];

export interface TopBarAccount {
  name: string;
  email?: string;
  items?: readonly ShellMenuEntry[];
  theme?: { value: ShellTheme; onChange: (value: ShellTheme) => void; label?: string };
  endItems?: readonly ShellMenuEntry[];
  label?: string;
}

export interface TopBarNotifications {
  unread?: number;
  onClick?: () => void;
  label?: string;
}

const Identity = ({ account }: { account: TopBarAccount }) => (
  <div className={styles.identity}>
    <span className={styles.identityName}>{account.name}</span>
    {account.email && <span className={styles.identityMeta}>{account.email}</span>}
  </div>
);

const AccountMenu = ({ account }: { account: TopBarAccount }) => {
  const items = account.items ?? [];
  const endItems = account.endItems ?? [];
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon="user"
          layout="trigger"
          aria-label={`${account.label ?? "Account"}, ${account.name}`}
        >
          {account.name}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={styles.accountMenu}>
        <Identity account={account} />
        <DropdownMenuSeparator />
        <ShellMenuItems entries={items} />
        {account.theme && (
          <>
            {items.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel>{account.theme.label ?? "Theme"}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={account.theme.value}
              onValueChange={(value) => account.theme?.onChange(value as ShellTheme)}
            >
              {themeOptions.map((option) => (
                <DropdownMenuRadioItem key={option.value} value={option.value}>
                  {option.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </>
        )}
        {endItems.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <ShellMenuItems entries={endItems} />
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const AccountSheet = ({
  account,
  open,
  onOpenChange
}: {
  account: TopBarAccount;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const close = () => onOpenChange(false);
  const items = account.items ?? [];
  const endItems = account.endItems ?? [];
  return (
    <ShellBottomSheet title={account.label ?? "Account"} open={open} onOpenChange={onOpenChange}>
      <Identity account={account} />
      <span role="separator" className={styles.sheetRule} />
      <ShellSheetRows entries={items} onDone={close} />
      {account.theme && (
        <>
          {items.length > 0 && <span role="separator" className={styles.sheetRule} />}
          <div className={styles.sheetTheme}>
            <span className={styles.sheetEyebrow}>{account.theme.label ?? "Theme"}</span>
            <ToggleGroup
              type="single"
              aria-label={account.theme.label ?? "Theme"}
              value={account.theme.value}
              onValueChange={(value) => {
                if (value) account.theme?.onChange(value as ShellTheme);
              }}
              width="full"
              className={styles.sheetThemeChoice}
            >
              {themeOptions.map((option) => (
                <ToggleGroupItem key={option.value} value={option.value}>
                  {option.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </>
      )}
      {endItems.length > 0 && (
        <ShellSheetRows entries={[{ type: "separator" }, ...endItems]} onDone={close} />
      )}
    </ShellBottomSheet>
  );
};

const plainCrumb = (crumb: BreadcrumbCrumb): BreadcrumbCrumb => ({
  label: crumb.label,
  mono: crumb.mono,
  link: crumb.link,
  href: crumb.href,
  onNavigate: crumb.onNavigate
});

export type TopBarProps = Omit<React.ComponentPropsWithoutRef<"header">, "children"> & {
  breadcrumb: readonly BreadcrumbCrumb[];
  search?: { onClick: () => void; label?: string; shortcut?: string };
  notifications?: TopBarNotifications;
  account?: TopBarAccount;
  actions?: React.ReactNode;
  label?: string;
  navigationLabel?: string;
};

export function TopBar({
  breadcrumb,
  search,
  notifications,
  account,
  actions,
  label = "Location",
  navigationLabel = "Open navigation",
  className,
  ref,
  ...props
}: TopBarProps & { ref?: React.Ref<HTMLElement> }) {
  const shell = useAppShell();
  const mode = shell?.mode ?? "wide";
  const narrow = mode === "narrow";
  useReportPresence(useShellChrome()?.topBar, true);
  const [accountOpen, setAccountOpen] = React.useState(false);
  const searchLabel = search?.label ?? "Search";
  const notificationsLabel = notifications?.label ?? "Notifications";
  const unread = notifications?.unread ?? 0;
  const marked = unread > 0 || Boolean(shell?.navigationUnread);
  const [root, ...rest] = breadcrumb;
  const org = root?.switcher ? root : undefined;
  const orgZone = Boolean(org) && !narrow;
  const switchers = (org ? rest : breadcrumb).filter((crumb) => crumb.switcher);
  const slots = shell?.slots ?? {};
  const notificationsButton = (size: "sm" | "icon-lg") => (
    <Tooltip content={notificationsLabel} side="bottom">
      <span className={styles.marked}>
        <Button
          type="button"
          variant="ghost"
          size={size}
          icon="bell"
          iconOnly
          onClick={notifications?.onClick}
        >
          {unread > 0 ? `${notificationsLabel}, ${unread} unread` : notificationsLabel}
        </Button>
        {unread > 0 &&
          (size === "sm" ? (
            <span className={styles.marker} aria-hidden="true" />
          ) : (
            <Count className={styles.count} aria-hidden="true">
              {unread}
            </Count>
          ))}
      </span>
    </Tooltip>
  );
  return (
    <TooltipProvider>
      <header
        ref={ref}
        data-slot="top-bar"
        data-mode={mode}
        data-org-zone={orgZone || undefined}
        className={cn(styles.topBar, className)}
        {...props}
      >
        {narrow && shell?.hasNavigation && (
          <span className={styles.marked}>
            <Button
              ref={shell.navigationTrigger}
              type="button"
              variant="ghost"
              size="icon-lg"
              icon="menu"
              iconOnly
              aria-expanded={shell.navigationOpen}
              aria-haspopup="dialog"
              aria-keyshortcuts="Meta+B Control+B"
              onClick={() => shell.setNavigationOpen(true)}
            >
              {marked ? `${navigationLabel}, unread updates` : navigationLabel}
            </Button>
            {marked && <span className={styles.marker} aria-hidden="true" />}
          </span>
        )}
        <Breadcrumb
          aria-label={label}
          variant="product"
          items={narrow ? breadcrumb.slice(-2).map(plainCrumb) : breadcrumb}
          data-org-zone={orgZone || undefined}
          className={styles.trail}
        />
        <div className={styles.actions}>
          {!narrow && actions}
          {!narrow && notifications && notificationsButton("sm")}
          {search && (
            <Tooltip content={searchLabel} shortcut={search.shortcut ?? "mod+K"} side="bottom">
              <Button
                type="button"
                variant="ghost"
                size={narrow ? "icon-lg" : "sm"}
                icon="search"
                iconOnly
                aria-keyshortcuts="Meta+K Control+K"
                onClick={search.onClick}
              >
                {searchLabel}
              </Button>
            </Tooltip>
          )}
          {!narrow && account && (
            <>
              <BandDivider />
              <AccountMenu account={account} />
            </>
          )}
        </div>
        {slots.org &&
          org &&
          createPortal(
            <Breadcrumb
              aria-label={org.switcher?.label ?? label}
              variant="product"
              lastIsCurrent={false}
              items={[org]}
              data-fill=""
              className={styles.sheetOrg}
            />,
            slots.org
          )}
        {slots.switchers &&
          switchers.length > 0 &&
          createPortal(
            switchers.map((crumb, index) => (
              <Breadcrumb
                key={index}
                aria-label={crumb.switcher?.label ?? label}
                variant="product"
                lastIsCurrent={false}
                items={[crumb]}
                data-fill=""
                className={styles.sheetSwitcher}
              />
            )),
            slots.switchers
          )}
        {slots.account &&
          account &&
          createPortal(
            <button
              type="button"
              className={styles.userRow}
              aria-haspopup="dialog"
              aria-expanded={accountOpen}
              onClick={() => setAccountOpen(true)}
            >
              <Icon name="user" size={18} />
              <span className={styles.identity}>
                <span className={styles.identityName}>{account.name}</span>
                {account.email && <span className={styles.identityMeta}>{account.email}</span>}
              </span>
              <Icon name="chev-ud" size={16} className={styles.menuEnd} />
            </button>,
            slots.account
          )}
        {slots.icons && notifications && createPortal(notificationsButton("icon-lg"), slots.icons)}
        {narrow && account && (
          <AccountSheet account={account} open={accountOpen} onOpenChange={setAccountOpen} />
        )}
      </header>
    </TooltipProvider>
  );
}
TopBar.displayName = "TopBar";
