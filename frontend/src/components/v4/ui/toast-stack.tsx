import * as React from "react";

import { cn } from "../lib/utils";
import { Button } from "./button";
import { Icon, type IconName } from "./icon";
import { Spinner } from "./spinner";

import styles from "./helpers.module.css";

export type ToastItem = {
  id: string;
  title: string;
  description?: string;
  tone?: "neutral" | "ok" | "bad" | "loading";
  icon?: IconName;
  action?: { label: string; onClick: () => void };
  duration?: number;
};
const Toast = ({ item, onDismiss }: { item: ToastItem; onDismiss?: (id: string) => void }) => {
  const duration = item.tone === "bad" || item.tone === "loading" ? 0 : (item.duration ?? 5000);
  const [hovered, setHovered] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const remaining = React.useRef(duration);
  React.useEffect(() => {
    remaining.current = duration;
  }, [duration, item.id]);
  React.useEffect(() => {
    if (!duration || !onDismiss || hovered || focused) return;
    const started = Date.now();
    const timer = window.setTimeout(() => onDismiss(item.id), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - started));
    };
  }, [duration, item.id, onDismiss, hovered, focused]);

  return (
    <div
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          setFocused(false);
      }}
      data-slot="toast"
      data-tone={item.tone ?? "neutral"}
      className={styles.toast}
    >
      {item.tone === "loading" ? (
        <Spinner />
      ) : (
        <Icon
          name={
            item.icon ?? (item.tone === "bad" ? "alert-c" : item.tone === "ok" ? "check-c" : "info")
          }
        />
      )}
      <div className={styles.toastBody}>
        <div className={styles.toastTitle}>{item.title}</div>
        {item.description && <div className={styles.toastDescription}>{item.description}</div>}
        {item.action && (
          <div className={styles.toastActions}>
            <Button type="button" size="sm" variant="ghost" onClick={item.action.onClick}>
              {item.action.label}
            </Button>
          </div>
        )}
      </div>
      {onDismiss && item.tone !== "loading" && (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={`Dismiss ${item.title}`}
          onClick={() => onDismiss(item.id)}
        >
          <Icon name="x" />
        </Button>
      )}
    </div>
  );
};
type Announcement = { key: string; text: string };
const announcementKey = (item: ToastItem) => `${item.id}:${item.tone ?? "neutral"}:${item.title}`;
const announce = (fresh: ToastItem[]): Announcement | null =>
  fresh.length
    ? {
        key: fresh.map(announcementKey).join("|"),
        text: fresh
          .map((item) => [item.title, item.description].filter(Boolean).join(" "))
          .join(" ")
      }
    : null;

export const ToastStack = ({
  items,
  onDismiss,
  inline = false,
  className
}: {
  items: readonly ToastItem[];
  onDismiss?: (id: string) => void;
  inline?: boolean;
  className?: string;
}) => {
  const [previous, setPrevious] = React.useState(items);
  const [polite, setPolite] = React.useState<Announcement | null>(null);
  const [assertive, setAssertive] = React.useState<Announcement | null>(null);
  if (previous !== items) {
    setPrevious(items);
    const known = new Set(previous.map(announcementKey));
    const fresh = items.filter((item) => !known.has(announcementKey(item)));
    const errors = announce(fresh.filter((item) => item.tone === "bad"));
    const others = announce(fresh.filter((item) => item.tone !== "bad"));
    if (errors) setAssertive(errors);
    if (others) setPolite(others);
  }
  return (
    <div
      data-slot="toast-stack"
      className={cn(styles.toastStack, !inline && styles.toastFixed, className)}
    >
      <div role="status" className="sr-only" data-slot="toast-live-polite">
        {polite && <p key={polite.key}>{polite.text}</p>}
      </div>
      <div role="alert" className="sr-only" data-slot="toast-live-assertive">
        {assertive && <p key={assertive.key}>{assertive.text}</p>}
      </div>
      {items.map((item) => (
        <Toast key={item.id} item={item} onDismiss={onDismiss} />
      ))}
    </div>
  );
};
