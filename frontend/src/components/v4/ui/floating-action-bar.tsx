import * as React from "react";
import { cn } from "cn";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { exit, snap, spring } from "../lib/motion";
import { Button } from "./button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "./dropdown-menu";
import { type IconName } from "./icon";

import styles from "./floating-action-bar.module.css";

export interface FloatingAction {
  label: string;
  icon?: IconName;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  loading?: boolean;
}

export type FloatingActionBarProps = {
  count: number;
  total?: number;
  onSelectAll?: () => void;
  actions?: readonly FloatingAction[];
  moreActions?: readonly FloatingAction[];
  onClear: () => void;
  noun?: string;
  placement?: "fixed" | "contained";
  label?: string;
  className?: string;
};

const roving = (event: React.KeyboardEvent<HTMLDivElement>, onClear: () => void) => {
  if (!event.currentTarget.contains(event.target as Node) || event.defaultPrevented) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    onClear();
    return;
  }
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const buttons = [...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled)")];
  const index = buttons.indexOf(document.activeElement as HTMLElement);
  if (index === -1) return;
  event.preventDefault();
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length;
  buttons[next]?.focus();
};

export const FloatingActionBar = ({
  count,
  total,
  onSelectAll,
  actions = [],
  moreActions = [],
  onClear,
  noun = "selected",
  placement = "fixed",
  label = "Bulk actions",
  className
}: FloatingActionBarProps) => {
  const reduced = useReducedMotion();
  const lastCount = React.useRef(count);
  const returnFocus = React.useRef<HTMLElement | null>(null);
  const bar = React.useRef<HTMLDivElement | null>(null);
  if (count > 0) lastCount.current = count;
  const shown = count > 0;
  React.useEffect(() => {
    if (shown || !bar.current?.contains(document.activeElement)) return;
    returnFocus.current?.focus();
  }, [shown]);
  const visibleCount = shown ? count : lastCount.current;
  return (
    <AnimatePresence>
      {shown && (
        <motion.div
          ref={bar}
          key="bar"
          data-slot="floating-action-bar"
          data-placement={placement}
          role="toolbar"
          data-v4-escape-owner=""
          aria-label={label}
          className={cn(styles.bar, className)}
          initial={{ opacity: 0, y: reduced ? 0 : 16 }}
          animate={{ opacity: 1, y: 0, transition: reduced ? snap : spring.moderate }}
          exit={{ opacity: 0, y: reduced ? 0 : 16, transition: reduced ? snap : exit.moderate }}
          onFocus={(event: React.FocusEvent<HTMLDivElement>) => {
            const from = event.relatedTarget as HTMLElement | null;
            if (from && !event.currentTarget.contains(from)) returnFocus.current = from;
          }}
          onKeyDown={(event: React.KeyboardEvent<HTMLDivElement>) => roving(event, onClear)}
        >
          <span className={styles.count} role="status">
            <span className={styles.number}>{visibleCount}</span>
            <span className={styles.noun}>{noun}</span>
          </span>
          {total !== undefined && onSelectAll && visibleCount < total && (
            <Button variant="link" size="sm" className={styles.selectAll} onClick={onSelectAll}>
              Select all {total}
            </Button>
          )}
          <span className={styles.rule} aria-hidden="true" />
          <span className={styles.actions}>
            {actions.map((action) => (
              <Button
                key={action.label}
                variant={action.danger ? "danger-ghost" : "ghost"}
                size="sm"
                icon={action.icon}
                disabled={action.disabled}
                loading={action.loading}
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            ))}
            {moreActions.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" iconRight="chev-down">
                    More
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="top" align="end">
                  {moreActions.map((action) => (
                    <DropdownMenuItem
                      key={action.label}
                      variant={action.danger ? "destructive" : "default"}
                      disabled={action.disabled || action.loading}
                      onSelect={action.onClick}
                    >
                      {action.loading ? `${action.label} (running)` : action.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </span>
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
