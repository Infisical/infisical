import * as React from "react";

import { cn } from "../lib/utils";
import { Checkbox } from "./checkbox";
import { Skeleton } from "./skeleton";

import styles from "./data.module.css";
import frame from "./frame.module.css";

interface ListContextValue {
  selected: readonly string[];
  multiple: boolean;
  size: "md" | "sm";
  actionsPlacement: "end" | "below";
  toggle: (id: string) => void;
}
const ListContext = React.createContext<ListContextValue | null>(null);
export interface ListRowProps {
  value: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  media?: React.ReactNode;
  badge?: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  error?: React.ReactNode;
  children?: React.ReactNode;
  href?: string;
  onClick?: (event: React.MouseEvent) => void;
  current?: boolean;
  disabled?: boolean;
  selectable?: boolean;
  unread?: boolean;
  resolved?: boolean;
  label: string;
}
export function ListRow({
  value,
  title,
  description,
  media,
  badge,
  meta,
  actions,
  error,
  children,
  href,
  onClick,
  current,
  disabled,
  selectable = true,
  unread,
  resolved,
  label
}: ListRowProps) {
  const context = React.useContext(ListContext);
  const fullTitle = typeof title === "string" ? title : undefined;
  const checked = context?.selected.includes(value);
  const button = !href && (onClick || (context?.multiple && selectable));
  const click = (event: React.MouseEvent) => {
    if (disabled) {
      event.preventDefault();
      return;
    }
    if (onClick) onClick(event);
    else if (context?.multiple && selectable) context.toggle(value);
  };
  let disabledRole: "button" | "link" | undefined;
  if (disabled && href) disabledRole = "link";
  else if (disabled && button) disabledRole = "button";
  const below = context?.actionsPlacement === "below" && context.size !== "sm";
  return (
    <li
      className={styles.listRow}
      data-list-row={value}
      data-selected={checked || undefined}
      data-current={current || undefined}
      data-disabled={disabled || undefined}
      data-resolved={resolved || undefined}
      data-size={context?.size}
      data-interactive={(!disabled && (href || button)) || undefined}
    >
      {context?.multiple && (
        <span className={styles.rowCheck}>
          <Checkbox
            aria-label={`Select ${label}`}
            checked={checked}
            disabled={disabled || !selectable}
            onCheckedChange={() => context.toggle(value)}
          />
        </span>
      )}
      {media}
      {unread && (
        <>
          <span className={styles.unread} aria-hidden />
          <span className={styles.sr}>Unread</span>
        </>
      )}
      <div className={styles.listBody}>
        <div className={styles.titleLine}>
          {href && !disabled ? (
            <a
              className={styles.rowTitle}
              title={fullTitle}
              href={href}
              onClick={click}
              aria-current={current ? "page" : undefined}
              data-list-target
            >
              {title}
            </a>
          ) : button && !disabled ? (
            <button
              type="button"
              className={styles.rowTitle}
              title={fullTitle}
              onClick={click}
              aria-current={current ? "true" : undefined}
              data-list-target
            >
              {title}
            </button>
          ) : (
            <span
              className={styles.rowTitle}
              title={fullTitle}
              role={disabledRole}
              aria-disabled={disabledRole ? true : undefined}
            >
              {title}
            </span>
          )}
          {badge && <span className={styles.rowBadge}>{badge}</span>}
          {meta && <span className={styles.rowMeta}>{meta}</span>}
        </div>
        {description && context?.size !== "sm" && (
          <p className={styles.description}>{description}</p>
        )}
        {error && (
          <div className={styles.rowError} role="alert">
            {error}
          </div>
        )}
        {children}
        {below && actions && <div className={styles.rowActions}>{actions}</div>}
      </div>
      {!below && actions && <div className={styles.rowActions}>{actions}</div>}
    </li>
  );
}
function rowProps(children: React.ReactNode): ListRowProps[] {
  return React.Children.toArray(children).flatMap((child) => {
    if (!React.isValidElement<ListRowProps & { children?: React.ReactNode }>(child)) return [];
    if (child.type === ListRow) return [child.props];
    return rowProps(child.props.children);
  });
}
export interface ListProps {
  children?: React.ReactNode;
  title?: React.ReactNode;
  action?: React.ReactNode;
  label: string;
  variant?: "framed" | "plain" | "bare";
  size?: "md" | "sm";
  actionsPlacement?: "end" | "below";
  selection?: "none" | "multiple";
  selectedIds?: readonly string[];
  defaultSelectedIds?: readonly string[];
  onSelectionChange?: (ids: string[]) => void;
  loading?: boolean;
  loadingRows?: number;
  empty?: React.ReactNode;
  footer?: React.ReactNode;
}
export function List({
  children,
  title,
  action,
  label,
  variant = "framed",
  size = "md",
  actionsPlacement = "end",
  selection = "none",
  selectedIds,
  defaultSelectedIds = [],
  onSelectionChange,
  loading,
  loadingRows = 3,
  empty = "No items",
  footer
}: ListProps) {
  const [own, setOwn] = React.useState<readonly string[]>(defaultSelectedIds);
  const selected = selectedIds ?? own;
  const list = React.useRef<HTMLUListElement>(null);
  const focusedRow = React.useRef<{ element: HTMLElement; index: number } | null>(null);
  React.useLayoutEffect(() => {
    const previous = focusedRow.current;
    const container = list.current;
    if (!previous || !container) return;
    const targets = Array.from(container.querySelectorAll<HTMLElement>("[data-list-target]"));
    if (container.contains(previous.element)) {
      const main = previous.element
        .closest("[data-list-row]")
        ?.querySelector<HTMLElement>("[data-list-target]");
      previous.index = main ? targets.indexOf(main) : previous.index;
      return;
    }
    const active = container.ownerDocument.activeElement;
    if (
      active &&
      active !== container.ownerDocument.body &&
      active !== container.ownerDocument.documentElement
    ) {
      focusedRow.current = null;
      return;
    }
    const next = targets[Math.min(Math.max(0, previous.index), targets.length - 1)];
    focusedRow.current = null;
    (next ?? container).focus({ preventScroll: true });
  });
  const rows = rowProps(children);
  const eligible = rows
    .filter((row) => !row.disabled && row.selectable !== false)
    .map((row) => row.value);
  const count = eligible.filter((id) => selected.includes(id)).length;
  const update = (next: string[]) => {
    if (selectedIds === undefined) setOwn(next);
    onSelectionChange?.(next);
  };
  const toggle = (id: string) => {
    if (eligible.includes(id))
      update(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };
  const key = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (!(event.target instanceof HTMLElement) || !event.target.hasAttribute("data-list-target"))
      return;
    const targets = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("[data-list-target]")
    );
    const index = targets.indexOf(event.target);
    let next: number | undefined;
    if (event.key === "ArrowDown") next = Math.min(targets.length - 1, index + 1);
    if (event.key === "ArrowUp") next = Math.max(0, index - 1);
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = targets.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      targets[next]?.focus();
    }
  };
  return (
    <ListContext.Provider
      value={{ selected, multiple: selection === "multiple", toggle, size, actionsPlacement }}
    >
      <div
        className={cn(styles.listShell, variant === "framed" && frame.frame)}
        data-slot="list"
        data-variant={variant}
        data-size={size}
      >
        {(title || action) && (
          <div
            className={variant === "framed" ? frame.frameHead : styles.listHeader}
            data-select={selection === "multiple" || undefined}
          >
            {selection === "multiple" && (
              <Checkbox
                aria-label={`Select all ${label}`}
                disabled={!eligible.length}
                checked={
                  count > 0 && count < eligible.length
                    ? "indeterminate"
                    : eligible.length > 0 && count === eligible.length
                }
                onCheckedChange={() =>
                  update(
                    count === eligible.length
                      ? selected.filter((id) => !eligible.includes(id))
                      : [...new Set([...selected, ...eligible])]
                  )
                }
              />
            )}
            {title && (
              <div className={variant === "framed" ? frame.frameTitle : styles.listTitle}>
                {title}
              </div>
            )}
            {action && (
              <div className={variant === "framed" ? frame.frameAction : styles.listHeaderAction}>
                {action}
              </div>
            )}
          </div>
        )}
        <ul
          ref={list}
          className={cn(styles.list, variant === "framed" && frame.frameInset)}
          aria-label={label}
          aria-busy={loading}
          tabIndex={-1}
          onKeyDown={key}
          onFocusCapture={(event) => {
            if (!(event.target instanceof HTMLElement)) return;
            const row = event.target.closest("[data-list-row]");
            const main = row?.querySelector<HTMLElement>("[data-list-target]");
            if (!row || !main) {
              focusedRow.current = null;
              return;
            }
            const targets = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>("[data-list-target]")
            );
            focusedRow.current = { element: event.target, index: targets.indexOf(main) };
          }}
          onBlurCapture={(event) => {
            if (
              event.relatedTarget instanceof Node &&
              !event.currentTarget.contains(event.relatedTarget)
            )
              focusedRow.current = null;
            else if (
              !event.relatedTarget &&
              event.target instanceof HTMLElement &&
              event.target.isConnected
            )
              focusedRow.current = null;
          }}
        >
          {children}
          {loading &&
            Array.from({ length: loadingRows }, (_, index) => (
              <li key={`loading-${index}`} className={styles.listRow} aria-hidden>
                <Skeleton />
                <span className={styles.sr}>Loading</span>
              </li>
            ))}
          {!rows.length && !loading && <li className={styles.empty}>{empty}</li>}
        </ul>
        {footer && <div className={styles.status}>{footer}</div>}
        <span className={styles.sr} role="status">
          {selection === "multiple"
            ? `${selected.length} selected`
            : loading
              ? "Loading items"
              : ""}
        </span>
      </div>
    </ListContext.Provider>
  );
}
export function ListSection({
  label,
  meta,
  children
}: {
  label: React.ReactNode;
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li>
      <div className={styles.sectionHead}>
        <div className={styles.sectionLabel}>{label}</div>
        {meta && <div className={styles.sectionMeta}>{meta}</div>}
      </div>
      <ul className={styles.list}>{children}</ul>
    </li>
  );
}
export function DataList({
  items,
  variant = "stat"
}: {
  items: readonly (readonly [React.ReactNode, React.ReactNode])[];
  variant?: "stat" | "meta" | "props";
}) {
  return (
    <dl className={styles.dataList} data-slot="data-list" data-variant={variant}>
      {items.map(([term, value], index) => (
        <div key={index} className={styles.dataPair}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
