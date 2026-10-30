import * as React from "react";

import { cn } from "../lib/utils";

import detailStyles from "./detail-layout.module.css";
import styles from "./text.module.css";

export function PageMeasure({
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      data-slot="page-measure"
      className={cn(styles.measurePage, className)}
      {...props}
    />
  );
}
PageMeasure.displayName = "PageMeasure";
export function FormMeasure({
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      data-slot="form-measure"
      className={cn(styles.measureForm, className)}
      {...props}
    />
  );
}
FormMeasure.displayName = "FormMeasure";

export type LayoutGap = 0 | 4 | 8 | 12 | 16 | 24 | 32 | 48;
type LayoutProps = React.ComponentPropsWithoutRef<"div"> & {
  gap?: LayoutGap;
  align?: "start" | "center" | "end" | "stretch";
  justify?: "start" | "center" | "end" | "between";
};
const spacing = (gap: LayoutGap) => (gap === 0 ? 0 : `var(--v4-space-${gap})`);
const alignment = (align: LayoutProps["align"]) =>
  align === "start" ? "flex-start" : align === "end" ? "flex-end" : align;
export function Stack({
  gap = 16,
  align = "stretch",
  justify = "start",
  style,
  className,
  ref,
  ...props
}: LayoutProps & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      data-slot="stack"
      className={cn(styles.stack, className)}
      style={{
        gap: spacing(gap),
        alignItems: alignment(align),
        justifyContent: justify === "between" ? "space-between" : alignment(justify),
        ...style
      }}
      {...props}
    />
  );
}
Stack.displayName = "Stack";
export function Inline({
  gap = 8,
  align = "center",
  justify = "start",
  wrap = true,
  style,
  className,
  ref,
  ...props
}: LayoutProps & { wrap?: boolean } & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div
      ref={ref}
      data-slot="inline"
      className={cn(styles.inline, className)}
      style={{
        gap: spacing(gap),
        alignItems: alignment(align),
        justifyContent: justify === "between" ? "space-between" : alignment(justify),
        flexWrap: wrap ? "wrap" : "nowrap",
        ...style
      }}
      {...props}
    />
  );
}
Inline.displayName = "Inline";
export function Grid({
  gap = 16,
  columns,
  style,
  className,
  ref,
  ...props
}: Omit<LayoutProps, "align" | "justify"> & { columns?: 2 | 3 | 4 } & {
  ref?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      data-slot="grid"
      className={cn(styles.grid, className)}
      style={{
        gap: spacing(gap),
        gridTemplateColumns: columns
          ? `repeat(${columns}, minmax(0, 1fr))`
          : "repeat(auto-fit, minmax(min(100%, var(--v4-size-tile-min, 208px)), 1fr))",
        ...style
      }}
      {...props}
    />
  );
}
Grid.displayName = "Grid";
export function Container({
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <div ref={ref} data-slot="container" className={cn(styles.container, className)} {...props} />
  );
}
Container.displayName = "Container";
export function Measure({
  size = "prose",
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & { size?: "page" | "form" | "prose" } & {
  ref?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={ref}
      data-slot="measure"
      data-size={size}
      className={cn(
        size === "page"
          ? styles.measurePage
          : size === "form"
            ? styles.measureForm
            : styles.measureProse,
        className
      )}
      {...props}
    />
  );
}
Measure.displayName = "Measure";

const scrollParent = (node: HTMLElement) => {
  for (let parent = node.parentElement; parent; parent = parent.parentElement) {
    if (/(auto|scroll|overlay)/.test(getComputedStyle(parent).overflowY)) return parent;
  }
  return null;
};

export function DetailLayout({
  aside,
  asideLabel,
  children,
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"div"> & {
  aside: React.ReactNode;
  asideLabel: string;
  ref?: React.Ref<HTMLDivElement>;
}) {
  const asideRef = React.useRef<HTMLElement>(null);
  const [fits, setFits] = React.useState(false);
  React.useLayoutEffect(() => {
    const node = asideRef.current;
    if (!node) return undefined;
    const scroller = scrollParent(node);
    const measure = () => {
      const style = getComputedStyle(node);
      const room =
        (scroller ? scroller.clientHeight : window.innerHeight) -
        (parseFloat(style.scrollMarginTop) || 0) -
        (parseFloat(style.scrollMarginBottom) || 0);
      setFits(node.offsetHeight <= room);
    };
    measure();
    window.addEventListener("resize", measure);
    if (typeof ResizeObserver === "undefined")
      return () => window.removeEventListener("resize", measure);
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    if (scroller) observer.observe(scroller);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  return (
    <div
      ref={ref}
      data-slot="detail-layout"
      className={cn(detailStyles.root, className)}
      {...props}
    >
      <div className={detailStyles.columns}>
        <aside
          ref={asideRef}
          data-slot="detail-layout-aside"
          data-sticky={fits || undefined}
          aria-label={asideLabel}
          className={detailStyles.aside}
        >
          {aside}
        </aside>
        <div data-slot="detail-layout-main" className={detailStyles.main}>
          {children}
        </div>
      </div>
    </div>
  );
}
DetailLayout.displayName = "DetailLayout";
