"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "../lib/utils";
import { Button } from "./button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "./dropdown-menu";
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
        "[&_tr]:border-b [&_tr]:border-[color:var(--v4-line)] [&_tr]:hover:bg-transparent",
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
        "border-t border-[color:var(--v4-line)] font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  );
}
TableFooter.displayName = "TableFooter";

function TableRow({ className, ref, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      ref={ref}
      data-slot="table-row"
      className={cn(
        "border-b border-[color:var(--v4-line-soft)] transition-colors duration-(--v4-duration-fast) data-[state=selected]:bg-[color:var(--v4-selected-surface)]",
        styles.nativeTableRow,
        className
      )}
      {...props}
    />
  );
}
TableRow.displayName = "TableRow";

function TableHead({ className, ref, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      ref={ref}
      data-slot="table-head"
      className={cn(styles.nativeTableHead, className)}
      {...props}
    />
  );
}
TableHead.displayName = "TableHead";

function TableCell({ className, ref, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      ref={ref}
      data-slot="table-cell"
      className={cn(styles.nativeTableCell, className)}
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
    <Tooltip content={reason ?? action.label}>
      <span className={styles.tableRowActionSlot}>
        <Button
          variant="ghost"
          size="icon-row"
          iconOnly
          disabled={Boolean(reason)}
          aria-description={reason}
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

const rowActionSlots = (inline: number, menu: boolean) => Math.max(1, inline + (menu ? 1 : 0));

export {
  rowActionSlots,
  RowActions,
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
