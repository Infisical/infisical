"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { keyboardModality } from "../lib/input-modality";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "./context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "./dropdown-menu";
import { Icon, type IconName } from "./icon";
import { Tooltip } from "./tooltip";

import styles from "./data.module.css";

function Table({
  className,
  containerClassName,
  containerRef,
  ref,
  ...props
}: React.ComponentProps<"table"> & {
  /** Layout classes for the scroll container (height caps, flex sizing). ref targets the table element itself. */
  containerClassName?: string;
  /** The horizontal scroll container, which v3 Table's ref pointed at. */
  containerRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={containerRef}
      data-slot="table-container"
      data-scroll-fade="x"
      className={cn("relative w-full", styles.nativeTableContainer, containerClassName)}
    >
      <table
        ref={ref}
        data-slot="table"
        className={cn("w-full caption-bottom", styles.nativeTable, className)}
        {...props}
      />
    </div>
  );
}
Table.displayName = "Table";

function TableHeader({ className, ref, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      ref={ref}
      data-slot="table-header"
      className={cn(
        "[&_tr]:border-b [&_tr]:border-[color:var(--v4-line-soft)] [&_tr]:hover:bg-transparent",
        className
      )}
      {...props}
    />
  );
}
TableHeader.displayName = "TableHeader";

function TableBody({ className, ref, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      ref={ref}
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}
TableBody.displayName = "TableBody";

function TableFooter({ className, ref, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      ref={ref}
      data-slot="table-footer"
      className={cn(
        "border-t border-[color:var(--v4-line-soft)] font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  );
}
TableFooter.displayName = "TableFooter";

const interactiveTarget =
  "a, button, input, select, textarea, label, summary, [contenteditable], [tabindex]:not(tr), [role=button], [role=checkbox], [role=combobox], [role=link], [role=menuitem], [role=switch], [role=tab], [data-row-interactive]";
const activatesRow = (event: React.MouseEvent<HTMLTableRowElement>) => {
  const row = event.currentTarget;
  const target = event.target as Element;
  if (event.button !== 0 || !row.contains(target)) return false;
  const interactive = target.closest(interactiveTarget);
  if (interactive && row.contains(interactive)) return false;
  const selection = window.getSelection();
  return !(selection && !selection.isCollapsed && row.contains(selection.anchorNode));
};

/** A row draws its focus ring only when the keyboard moved focus to it, never after a pointer interaction. */
function TableRow({
  className,
  onClick,
  onFocus,
  onBlur,
  ref,
  ...props
}: React.ComponentProps<"tr">) {
  return (
    <tr
      ref={ref}
      data-slot="table-row"
      className={cn(
        "border-b border-[color:var(--v4-line-soft)] transition-colors duration-(--v4-duration-fast)",
        styles.nativeTableRow,
        className
      )}
      onClick={
        onClick &&
        ((event) => {
          if (activatesRow(event)) onClick(event);
        })
      }
      onFocus={(event) => {
        onFocus?.(event);
        if (event.target === event.currentTarget && keyboardModality())
          event.currentTarget.setAttribute("data-focus-ring", "");
      }}
      onBlur={(event) => {
        onBlur?.(event);
        if (event.target === event.currentTarget)
          event.currentTarget.removeAttribute("data-focus-ring");
      }}
      {...props}
    />
  );
}
TableRow.displayName = "TableRow";

type SelectionProps = {
  /** Draws the selection column: size-row wide, a centered Checkbox and a persistent line-soft divider on its right. */
  selection?: boolean;
  /** With selection, false drops the divider, for an icon or expand column that doubles as selection. */
  divider?: boolean;
};

function TableHead({
  selection,
  divider = true,
  className,
  ref,
  ...props
}: React.ComponentProps<"th"> & SelectionProps) {
  return (
    <th
      ref={ref}
      data-slot={selection ? "table-selection" : "table-head"}
      data-divider={selection && !divider ? "false" : undefined}
      className={cn(styles.nativeTableHead, selection && styles.tableSelectionCell, className)}
      {...props}
    />
  );
}
TableHead.displayName = "TableHead";

function TableCell({
  selection,
  divider = true,
  className,
  ref,
  ...props
}: React.ComponentProps<"td"> & SelectionProps) {
  return (
    <td
      ref={ref}
      data-slot={selection ? "table-selection" : "table-cell"}
      data-divider={selection && !divider ? "false" : undefined}
      data-row-interactive={selection || undefined}
      className={cn(styles.nativeTableCell, selection && styles.tableSelectionCell, className)}
      {...props}
    />
  );
}
TableCell.displayName = "TableCell";

function TableCaption({ className, ref, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      ref={ref}
      data-slot="table-caption"
      className={cn(styles.nativeTableCaption, className)}
      {...props}
    />
  );
}
TableCaption.displayName = "TableCaption";

function TableRowActions({ className, ref, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      ref={ref}
      {...props}
      data-slot="table-row-actions"
      className={cn(styles.tableRowActions, className)}
    />
  );
}
TableRowActions.displayName = "TableRowActions";

function TableRowIndicators({ className, ref, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      ref={ref}
      {...props}
      data-slot="table-row-indicators"
      className={cn(styles.tableRowIndicators, className)}
    />
  );
}
TableRowIndicators.displayName = "TableRowIndicators";

type SlotStyle = React.CSSProperties & { "--v4-row-action-slots"?: number };

function TableActionsHead({
  slots = 1,
  className,
  style,
  children = "Actions",
  ref,
  ...props
}: React.ComponentProps<"th"> & { slots?: number }) {
  return (
    <th
      ref={ref}
      scope="col"
      {...props}
      data-slot="table-actions-head"
      data-actions
      className={cn(styles.nativeTableHead, styles.tableActions, className)}
      style={{ "--v4-row-action-slots": slots, ...style } as SlotStyle}
    >
      <span className={styles.sr}>{children}</span>
    </th>
  );
}
TableActionsHead.displayName = "TableActionsHead";

function TableActionsCell({
  slots = 1,
  className,
  style,
  ref,
  ...props
}: React.ComponentProps<"td"> & { slots?: number }) {
  return (
    <td
      ref={ref}
      {...props}
      data-slot="table-actions-cell"
      data-actions
      data-row-interactive
      className={cn(styles.nativeTableCell, styles.tableActions, className)}
      style={{ "--v4-row-action-slots": slots, ...style } as SlotStyle}
    />
  );
}
TableActionsCell.displayName = "TableActionsCell";

export type RowAction = {
  label: string;
  icon: IconName | LucideIcon;
  onSelect: () => void;
  disabledReason?: string;
};
export type UpToThree<T> = readonly [] | readonly [T] | readonly [T, T] | readonly [T, T, T];
export type RowActionList = UpToThree<RowAction>;

const stop = (event: React.MouseEvent) => event.stopPropagation();

function RowActionButton({ action, label }: { action: RowAction; label: string }) {
  const reason = action.disabledReason;
  return (
    <Tooltip content={reason ? undefined : action.label}>
      <span className={styles.tableRowActionSlot}>
        <Button
          variant="ghost"
          size="icon-row"
          iconOnly
          disabledReason={reason}
          onClick={(event) => {
            stop(event);
            action.onSelect();
          }}
        >
          <Icon
            name={typeof action.icon === "string" ? action.icon : undefined}
            icon={typeof action.icon === "string" ? undefined : action.icon}
          />
          <span className="sr-only">{`${action.label} for ${label}`}</span>
        </Button>
      </span>
    </Tooltip>
  );
}

function RowActions({
  label,
  inline = [],
  menu,
  menuLabel = "More actions",
  menuDisabledReason,
  className,
  ref,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  label: string;
  inline?: RowActionList;
  menu?: React.ReactNode;
  menuLabel?: string;
  menuDisabledReason?: string;
}) {
  return (
    <TableRowActions ref={ref} className={className} {...props}>
      {inline.map((action) => (
        <RowActionButton key={action.label} action={action} label={label} />
      ))}
      {menu !== undefined && (
        <DropdownMenu>
          <Tooltip content={menuDisabledReason ?? menuLabel}>
            <span className={styles.tableRowActionSlot}>
              <DropdownMenuTrigger asChild disabled={Boolean(menuDisabledReason)}>
                <Button
                  variant="ghost"
                  size="icon-row"
                  icon="more"
                  iconOnly
                  aria-description={menuDisabledReason}
                  onClick={stop}
                >
                  {`${menuLabel} for ${label}`}
                </Button>
              </DropdownMenuTrigger>
            </span>
          </Tooltip>
          <DropdownMenuContent align="end">{menu}</DropdownMenuContent>
        </DropdownMenu>
      )}
    </TableRowActions>
  );
}
RowActions.displayName = "RowActions";

const editableTarget = (target: EventTarget) =>
  target instanceof Element &&
  Boolean(
    target.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')
  );

/**
 * Opens a row's actions as a right-click menu on the whole row: the inline actions first, then the
 * More menu items after a separator, from the same nodes RowActions renders. Shift+F10 and the Menu key
 * open it on a focused row; inputs and editable cells keep the browser's own menu.
 */
function RowContextMenu({
  label,
  inline = [],
  menu,
  menuDisabledReason,
  children
}: {
  label: string;
  inline?: RowActionList;
  menu?: React.ReactNode;
  menuDisabledReason?: string;
  children: React.ReactElement<React.ComponentProps<"tr">>;
}) {
  const [open, setOpen] = React.useState(false);
  const row = React.useRef<HTMLTableRowElement>(null);
  const showMenu = menu !== undefined && !menuDisabledReason;
  const rowProps = children.props as Record<string, unknown>;
  const nonData = rowProps["data-row-kind"] || rowProps["data-loading"] || rowProps["data-spacer"];
  if (nonData || (!inline.length && !showMenu)) return children;
  const { onContextMenuCapture, tabIndex } = children.props;
  return (
    <ContextMenu onOpenChange={setOpen}>
      <ContextMenuTrigger ref={row} asChild className="select-text">
        {React.cloneElement(children, {
          tabIndex: tabIndex ?? -1,
          "data-menu-open": open || undefined,
          onContextMenuCapture: (event: React.MouseEvent<HTMLTableRowElement>) => {
            onContextMenuCapture?.(event);
            if (editableTarget(event.target)) event.stopPropagation();
          }
        } as React.ComponentProps<"tr">)}
      </ContextMenuTrigger>
      <ContextMenuContent
        aria-label={`Actions for ${label}`}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          row.current?.focus({ preventScroll: true });
        }}
      >
        {inline.map((action) => (
          <DropdownMenuItem
            key={action.label}
            disabled={Boolean(action.disabledReason)}
            description={action.disabledReason}
            onSelect={action.onSelect}
          >
            <Icon
              name={typeof action.icon === "string" ? action.icon : undefined}
              icon={typeof action.icon === "string" ? undefined : action.icon}
            />
            {action.label}
          </DropdownMenuItem>
        ))}
        {inline.length > 0 && showMenu && <DropdownMenuSeparator />}
        {showMenu && menu}
      </ContextMenuContent>
    </ContextMenu>
  );
}
RowContextMenu.displayName = "RowContextMenu";

const rowActionSlots = (inline: number, menu: boolean) => Math.max(1, inline + (menu ? 1 : 0));

export {
  rowActionSlots,
  RowActions,
  RowContextMenu,
  Table,
  TableActionsCell,
  TableActionsHead,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  TableRowActions,
  TableRowIndicators
};
