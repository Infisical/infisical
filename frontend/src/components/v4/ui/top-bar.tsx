import * as React from "react";

import { cn } from "../lib/utils";
import { Breadcrumb, type BreadcrumbCrumb } from "./breadcrumb";
import { Button } from "./button";
import { Kbd } from "./kbd";

import styles from "./top-bar.module.css";

type ShellState = {
  narrow: boolean;
  hasNavigation: boolean;
  setHasNavigation: (value: boolean) => void;
  navigationOpen: boolean;
  setNavigationOpen: (open: boolean) => void;
  navigationTrigger: React.RefObject<HTMLButtonElement | null>;
  navigationToggle: React.RefObject<(() => void) | null>;
  toggleNavigation: () => void;
};

const ShellContext = React.createContext<ShellState | null>(null);

export const useAppShell = () => React.useContext(ShellContext);

const collapseWidth = (element: HTMLElement) =>
  parseFloat(getComputedStyle(element).getPropertyValue("--v4-size-shell-collapse")) || 0;

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
  const [narrow, setNarrow] = React.useState(false);
  const [hasNavigation, setHasNavigation] = React.useState(false);
  const [navigationOpen, setNavigationOpen] = React.useState(false);
  const navigationTrigger = React.useRef<HTMLButtonElement>(null);
  const navigationToggle = React.useRef<(() => void) | null>(null);
  const toggleNavigation = React.useCallback(() => navigationToggle.current?.(), []);
  const sheetOpen = React.useRef(false);
  React.useEffect(() => {
    sheetOpen.current = navigationOpen;
  }, [navigationOpen]);
  React.useImperativeHandle(ref, () => own.current as HTMLDivElement);
  React.useLayoutEffect(() => {
    const element = own.current;
    if (!element) return undefined;
    const measure = () => {
      const next = element.offsetWidth < collapseWidth(element);
      setNarrow(next);
      if (!next) setNavigationOpen(false);
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
      narrow,
      hasNavigation,
      setHasNavigation,
      navigationOpen,
      setNavigationOpen,
      navigationTrigger,
      navigationToggle,
      toggleNavigation
    }),
    [narrow, hasNavigation, navigationOpen, toggleNavigation]
  );
  return (
    <ShellContext value={value}>
      <div
        ref={own}
        data-slot="app-shell"
        data-narrow={narrow || undefined}
        className={cn(styles.shell, className)}
        {...props}
      />
    </ShellContext>
  );
}
AppShell.displayName = "AppShell";

export function AppInset({
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"main"> & { ref?: React.Ref<HTMLElement> }) {
  return (
    <main ref={ref} data-slot="app-inset" className={cn(styles.inset, className)} {...props} />
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

export type TopBarProps = Omit<React.ComponentPropsWithoutRef<"header">, "children"> & {
  breadcrumb: readonly BreadcrumbCrumb[];
  actions?: React.ReactNode;
  search?: { onClick: () => void; label?: string; shortcut?: string };
  label?: string;
  navigationLabel?: string;
};

export function TopBar({
  breadcrumb,
  actions,
  search,
  label = "Location",
  navigationLabel = "Open navigation",
  className,
  ref,
  ...props
}: TopBarProps & { ref?: React.Ref<HTMLElement> }) {
  const shell = useAppShell();
  const narrow = Boolean(shell?.narrow);
  const searchLabel = search?.label ?? "Search";
  return (
    <header
      ref={ref}
      data-slot="top-bar"
      data-narrow={narrow || undefined}
      className={cn(styles.topBar, className)}
      {...props}
    >
      {narrow && shell?.hasNavigation && (
        <Button
          ref={shell.navigationTrigger}
          type="button"
          variant="ghost"
          size="icon-sm"
          icon="menu"
          iconOnly
          aria-expanded={shell.navigationOpen}
          aria-haspopup="dialog"
          aria-keyshortcuts="Meta+B Control+B"
          className={styles.menu}
          onClick={() => shell.setNavigationOpen(true)}
        >
          {navigationLabel}
        </Button>
      )}
      <Breadcrumb
        aria-label={label}
        variant="product"
        items={narrow ? breadcrumb.slice(-1) : breadcrumb}
        className={styles.trail}
      />
      {(actions || search) && (
        <div className={styles.actions}>
          {actions}
          {search &&
            (narrow ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                icon="search"
                iconOnly
                aria-keyshortcuts="Meta+K Control+K"
                onClick={search.onClick}
              >
                {searchLabel}
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                icon="search"
                aria-keyshortcuts="Meta+K Control+K"
                onClick={search.onClick}
              >
                {searchLabel}
                <Kbd keys={search.shortcut ?? "mod+K"} size="sm" />
              </Button>
            ))}
        </div>
      )}
    </header>
  );
}
TopBar.displayName = "TopBar";
