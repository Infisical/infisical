"use client";

import * as React from "react";

import { cn } from "../lib/utils";

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

function TableRowActions({
  reveal = false,
  open = false,
  className,
  ref,
  ...props
}: React.ComponentProps<"div"> & { reveal?: boolean; open?: boolean }) {
  return (
    <div
      ref={ref}
      {...props}
      data-slot="table-row-actions"
      data-reveal={reveal || undefined}
      data-open={open || undefined}
      className={cn(styles.tableRowActions, className)}
    />
  );
}
TableRowActions.displayName = "TableRowActions";

function TableRowActionsSeparator({ className, ref, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      ref={ref}
      aria-hidden
      data-slot="table-row-actions-separator"
      className={cn(styles.tableRowActionsSeparator, className)}
      {...props}
    />
  );
}
TableRowActionsSeparator.displayName = "TableRowActionsSeparator";

function TableRowIndicators({
  swap = false,
  className,
  ref,
  ...props
}: React.ComponentProps<"span"> & { swap?: boolean }) {
  return (
    <span
      ref={ref}
      {...props}
      data-slot="table-row-indicators"
      data-swap={swap || undefined}
      className={cn(styles.tableRowIndicators, className)}
    />
  );
}
TableRowIndicators.displayName = "TableRowIndicators";

export {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
  TableRowActions,
  TableRowActionsSeparator,
  TableRowIndicators
};
