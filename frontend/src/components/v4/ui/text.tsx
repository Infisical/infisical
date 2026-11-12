import * as React from "react";

import { cn } from "../lib/utils";
import { Icon, type IconName } from "./icon";
import { Spinner } from "./spinner";

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

export function StatusText({
  tone = "neutral",
  icon,
  loading = false,
  className,
  children,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<"span"> & {
  tone?: "neutral" | "ok" | "warn" | "bad";
} & ({ icon: IconName; loading?: boolean } | { icon?: IconName; loading: true }) & {
    ref?: React.Ref<HTMLSpanElement>;
  }) {
  return (
    <span
      ref={ref}
      data-slot="status-text"
      data-tone={tone}
      data-loading={loading || undefined}
      className={cn(styles.status, className)}
      {...props}
    >
      {loading || !icon ? <Spinner /> : <Icon name={icon} />}
      <span>{children}</span>
    </span>
  );
}
StatusText.displayName = "StatusText";

/**
 * Marks every case-insensitive occurrence of query in text as a search match. The query is literal
 * text, never a pattern; terms matches each whitespace-separated word on its own.
 */
export function Highlight({
  text,
  query,
  terms = false,
  className
}: {
  text: string;
  query?: string;
  terms?: boolean;
  className?: string;
}) {
  const needles = (terms ? (query ?? "").split(/\s+/) : [(query ?? "").trim() && (query ?? "")])
    .map((needle) => needle.toLowerCase())
    .filter(Boolean);
  const lower = text.toLowerCase();
  const ranges = needles
    .flatMap((needle) => {
      const found: [number, number][] = [];
      for (let at = lower.indexOf(needle); at >= 0; at = lower.indexOf(needle, at + 1))
        found.push([at, at + needle.length]);
      return found;
    })
    .sort((a, b) => a[0] - b[0])
    .reduce<[number, number][]>((merged, range) => {
      const last = merged.at(-1);
      if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
      else merged.push([...range]);
      return merged;
    }, []);
  if (!ranges.length || lower.length !== text.length) return text;
  const parts: React.ReactNode[] = [];
  let from = 0;
  ranges.forEach(([start, end]) => {
    if (start > from) parts.push(text.slice(from, start));
    parts.push(
      <mark key={start} data-slot="highlight" className={cn(styles.highlight, className)}>
        {text.slice(start, end)}
      </mark>
    );
    from = end;
  });
  if (from < text.length) parts.push(text.slice(from));
  return parts;
}
