"use client";

import * as React from "react";
import { cn } from "cn";

import styles from "./data.module.css";

const Table = React.forwardRef<
  React.ComponentRef<"table">,
  React.ComponentPropsWithoutRef<"table">
>(({ className, ...props }, ref) => {
  return (
    <div data-slot="table-container" className={cn("relative w-full", styles.nativeTableContainer)}>
      <table
        ref={ref}
        data-slot="table"
        className={cn("w-full caption-bottom", styles.nativeTable, className)}
        {...props}
      />
    </div>
  );
});
Table.displayName = "Table";

const TableHeader = React.forwardRef<
  React.ComponentRef<"thead">,
  React.ComponentPropsWithoutRef<"thead">
>(({ className, ...props }, ref) => {
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
});
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<
  React.ComponentRef<"tbody">,
  React.ComponentPropsWithoutRef<"tbody">
>(({ className, ...props }, ref) => {
  return (
    <tbody
      ref={ref}
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
});
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<
  React.ComponentRef<"tfoot">,
  React.ComponentPropsWithoutRef<"tfoot">
>(({ className, ...props }, ref) => {
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
});
TableFooter.displayName = "TableFooter";

const TableRow = React.forwardRef<React.ComponentRef<"tr">, React.ComponentPropsWithoutRef<"tr">>(
  ({ className, ...props }, ref) => {
    return (
      <tr
        ref={ref}
        data-slot="table-row"
        className={cn(
          "border-b border-[color:var(--v4-line-soft)] transition-colors duration-(--v4-duration-fast) hover:bg-[color:var(--v4-tint)] has-aria-expanded:bg-[color:var(--v4-tint)] data-[state=selected]:bg-[color:var(--v4-selected-surface)]",
          className
        )}
        {...props}
      />
    );
  }
);
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef<React.ComponentRef<"th">, React.ComponentPropsWithoutRef<"th">>(
  ({ className, ...props }, ref) => {
    return (
      <th
        ref={ref}
        data-slot="table-head"
        className={cn(styles.nativeTableHead, className)}
        {...props}
      />
    );
  }
);
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<React.ComponentRef<"td">, React.ComponentPropsWithoutRef<"td">>(
  ({ className, ...props }, ref) => {
    return (
      <td
        ref={ref}
        data-slot="table-cell"
        className={cn(styles.nativeTableCell, className)}
        {...props}
      />
    );
  }
);
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<
  React.ComponentRef<"caption">,
  React.ComponentPropsWithoutRef<"caption">
>(({ className, ...props }, ref) => {
  return (
    <caption
      ref={ref}
      data-slot="table-caption"
      className={cn(styles.nativeTableCaption, className)}
      {...props}
    />
  );
});
TableCaption.displayName = "TableCaption";

export { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow };
