/* eslint-disable react/prop-types */

import * as React from "react";

import { cn } from "@app/components/v3/utils";

function UnstableTable({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div
      data-slot="table-container"
      className="relative w-full overflow-x-auto rounded-md border border-border bg-container"
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  );
}

function UnstableTableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("text-sm [&_tr]:border-b [&_tr]:hover:bg-transparent", className)}
      {...props}
    />
  );
}

function UnstableTableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody data-slot="table-body" className={cn("[&>tr]:last:border-b-0", className)} {...props} />
  );
}

function UnstableTableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("border-t border-border font-medium [&>tr]:last:border-b-0", className)}
      {...props}
    />
  );
}

function UnstableTableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b border-border transition-colors hover:bg-foreground/5 data-[state=selected]:bg-foreground/5",
        className
      )}
      {...props}
    />
  );
}

function UnstableTableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-[30px] border-x-0 border-t-0 border-b border-border px-3 text-left align-middle text-xs whitespace-nowrap text-accent [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        "has-[>svg]:cursor-pointer [&>svg]:ml-1 [&>svg]:inline-block [&>svg]:size-4",
        className
      )}
      {...props}
    />
  );
}

function UnstableTableCell({
  className,
  isTruncatable,
  ...props
}: React.ComponentProps<"td"> & { isTruncatable?: boolean }) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "h-[40px] px-3 align-middle whitespace-nowrap text-mineshaft-200 [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        isTruncatable && "max-w-0 truncate",
        className
      )}
      {...props}
    />
  );
}

function UnstableTableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("text-muted-foreground mt-4 text-sm", className)}
      {...props}
    />
  );
}

export {
  UnstableTable,
  UnstableTableBody,
  UnstableTableCaption,
  UnstableTableCell,
  UnstableTableFooter,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
};
