import * as React from "react";

import { cn } from "../lib/utils";

import styles from "./text.module.css";

export const Text = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<"p"> & { muted?: boolean }
>(({ muted = false, className, ...props }, ref) => (
  <p
    ref={ref}
    data-slot="text"
    className={cn(styles.text, muted && styles.muted, className)}
    {...props}
  />
));
Text.displayName = "Text";
export const SmallText = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<"p"> & { muted?: boolean }
>(({ muted = false, className, ...props }, ref) => (
  <p
    ref={ref}
    data-slot="small-text"
    className={cn(styles.small, muted && styles.muted, className)}
    {...props}
  />
));
SmallText.displayName = "SmallText";

export const Heading = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<"h2"> & {
    level?: 1 | 2 | 3 | 4 | 5 | 6;
    size?: "page" | "display" | "section" | "subsection";
  }
>(({ level = 2, size = "section", className, ...props }, ref) => {
  const Tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" = `h${level}`;
  return (
    <Tag
      ref={ref}
      data-slot="heading"
      data-size={size}
      className={cn(styles.heading, className)}
      {...props}
    />
  );
});
Heading.displayName = "Heading";
export const Meta = React.forwardRef<
  HTMLSpanElement,
  React.ComponentPropsWithoutRef<"span"> & { mono?: boolean }
>(({ mono = true, className, ...props }, ref) => (
  <span
    ref={ref}
    data-slot="meta"
    className={cn(styles.meta, mono && styles.mono, className)}
    {...props}
  />
));
Meta.displayName = "Meta";
