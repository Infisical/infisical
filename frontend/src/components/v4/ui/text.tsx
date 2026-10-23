import * as React from "react";

import { cn } from "../lib/utils";

import styles from "./text.module.css";

export function Text({
  muted = false,
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"p"> & { muted?: boolean } & {
  ref?: React.Ref<HTMLParagraphElement>;
}) {
  return (
    <p
      ref={ref}
      data-slot="text"
      className={cn(styles.text, muted && styles.muted, className)}
      {...props}
    />
  );
}
Text.displayName = "Text";
export function SmallText({
  muted = false,
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"p"> & { muted?: boolean } & {
  ref?: React.Ref<HTMLParagraphElement>;
}) {
  return (
    <p
      ref={ref}
      data-slot="small-text"
      className={cn(styles.small, muted && styles.muted, className)}
      {...props}
    />
  );
}
SmallText.displayName = "SmallText";

export function Heading({
  level = 2,
  size = "section",
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"h2"> & {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  size?: "page" | "display" | "section" | "subsection";
} & { ref?: React.Ref<HTMLHeadingElement> }) {
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
}
Heading.displayName = "Heading";
export function Meta({
  mono = true,
  className,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"span"> & { mono?: boolean } & {
  ref?: React.Ref<HTMLSpanElement>;
}) {
  return (
    <span
      ref={ref}
      data-slot="meta"
      className={cn(styles.meta, mono && styles.mono, className)}
      {...props}
    />
  );
}
Meta.displayName = "Meta";
