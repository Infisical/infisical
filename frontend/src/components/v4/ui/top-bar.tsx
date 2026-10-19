import * as React from "react";

import { cn } from "../lib/utils";
import { Breadcrumb, type BreadcrumbCrumb } from "./breadcrumb";

import styles from "./top-bar.module.css";

export const AppShell = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-slot="app-shell" className={cn(styles.shell, className)} {...props} />
  )
);
AppShell.displayName = "AppShell";

export const AppInset = React.forwardRef<HTMLElement, React.ComponentPropsWithoutRef<"main">>(
  ({ className, ...props }, ref) => (
    <main ref={ref} data-slot="app-inset" className={cn(styles.inset, className)} {...props} />
  )
);
AppInset.displayName = "AppInset";

export const PageGutter = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-slot="page-gutter" className={cn(styles.gutter, className)} {...props} />
  )
);
PageGutter.displayName = "PageGutter";

export type TopBarProps = Omit<React.ComponentPropsWithoutRef<"header">, "children"> & {
  breadcrumb: readonly BreadcrumbCrumb[];
  actions?: React.ReactNode;
  label?: string;
};

export const TopBar = React.forwardRef<HTMLElement, TopBarProps>(
  ({ breadcrumb, actions, label = "Location", className, ...props }, ref) => (
    <header ref={ref} data-slot="top-bar" className={cn(styles.topBar, className)} {...props}>
      <Breadcrumb
        aria-label={label}
        variant="product"
        items={breadcrumb}
        className={styles.trail}
      />
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  )
);
TopBar.displayName = "TopBar";
