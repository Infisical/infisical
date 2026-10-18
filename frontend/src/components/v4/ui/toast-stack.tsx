import * as React from "react";
import { cn } from "cn";

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
      role={item.tone === "bad" ? "alert" : "status"}
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
      </div>
      {item.action && (
        <Button type="button" size="sm" variant="link" onClick={item.action.onClick}>
          {item.action.label}
        </Button>
      )}
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
}) => (
  <div
    data-slot="toast-stack"
    className={cn(styles.toastStack, !inline && styles.toastFixed, className)}
  >
    {items.map((item) => (
      <Toast key={item.id} item={item} onDismiss={onDismiss} />
    ))}
  </div>
);
