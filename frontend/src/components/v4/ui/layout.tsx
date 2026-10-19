import * as React from "react";
import { cn } from "cn";

import styles from "./text.module.css";

export const PageMeasure = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="page-measure"
      className={cn(styles.measurePage, className)}
      {...props}
    />
  )
);
PageMeasure.displayName = "PageMeasure";
export const FormMeasure = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      data-slot="form-measure"
      className={cn(styles.measureForm, className)}
      {...props}
    />
  )
);
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
export const Stack = React.forwardRef<HTMLDivElement, LayoutProps>(
  ({ gap = 16, align = "stretch", justify = "start", style, className, ...props }, ref) => (
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
  )
);
Stack.displayName = "Stack";
export const Inline = React.forwardRef<HTMLDivElement, LayoutProps & { wrap?: boolean }>(
  (
    { gap = 8, align = "center", justify = "start", wrap = true, style, className, ...props },
    ref
  ) => (
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
  )
);
Inline.displayName = "Inline";
export const Grid = React.forwardRef<
  HTMLDivElement,
  Omit<LayoutProps, "align" | "justify"> & { columns?: 2 | 3 | 4 }
>(({ gap = 16, columns, style, className, ...props }, ref) => (
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
));
Grid.displayName = "Grid";
export const Container = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<"div">>(
  ({ className, ...props }, ref) => (
    <div ref={ref} data-slot="container" className={cn(styles.container, className)} {...props} />
  )
);
Container.displayName = "Container";
export const Measure = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"div"> & { size?: "page" | "form" | "prose" }
>(({ size = "prose", className, ...props }, ref) => (
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
));
Measure.displayName = "Measure";
