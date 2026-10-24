"use client";

import * as React from "react";

import { cn } from "../lib/utils";

import styles from "./data.module.css";

function Table({ className, ref, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      data-scroll-fade="x"
      className={cn("relative w-full", styles.nativeTableContainer)}
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

export { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow };
