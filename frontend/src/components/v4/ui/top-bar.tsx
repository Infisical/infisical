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
};

const ShellContext = React.createContext<ShellState | null>(null);

export const useAppShell = () => React.useContext(ShellContext);

const collapseWidth = (element: HTMLElement) =>
  parseFloat(getComputedStyle(element).getPropertyValue("--v4-size-shell-collapse")) || 0;

export const AppShell = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => {
    const own = React.useRef<HTMLDivElement>(null);
    const [narrow, setNarrow] = React.useState(false);
    const [hasNavigation, setHasNavigation] = React.useState(false);
    const [navigationOpen, setNavigationOpen] = React.useState(false);
    const navigationTrigger = React.useRef<HTMLButtonElement>(null);
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
    const value = React.useMemo(
      () => ({
        narrow,
        hasNavigation,
        setHasNavigation,
        navigationOpen,
        setNavigationOpen,
        navigationTrigger
      }),
      [narrow, hasNavigation, navigationOpen]
    );
    return (
      <ShellContext.Provider value={value}>
        <div
          ref={own}
          data-slot="app-shell"
          data-narrow={narrow || undefined}
          className={cn(styles.shell, className)}
          {...props}
        />
      </ShellContext.Provider>
    );
  }
);
AppShell.displayName = "AppShell";

export const AppInset = React.forwardRef<HTMLElement, React.ComponentPropsWithoutRef<"main">>(
  ({ className, ...props }, ref) => (
    <main ref={ref} data-slot="app-inset" className={cn(styles.inset, className)} {...props} />
  )
);
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

export const PageGutter = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-slot="page-gutter" className={cn(styles.gutter, className)} {...props} />
  )
);
PageGutter.displayName = "PageGutter";

export type TopBarProps = Omit<React.ComponentPropsWithoutRef<"header">, "children"> & {
  breadcrumb: readonly BreadcrumbCrumb[];
  actions?: React.ReactNode;
  search?: { onClick: () => void; label?: string; shortcut?: string };
  label?: string;
  navigationLabel?: string;
};

export const TopBar = React.forwardRef<HTMLElement, TopBarProps>(
  (
    {
      breadcrumb,
      actions,
      search,
      label = "Location",
      navigationLabel = "Open navigation",
      className,
      ...props
    },
    ref
  ) => {
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
);
TopBar.displayName = "TopBar";
