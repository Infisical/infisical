/* eslint-disable react/prop-types */

import * as React from "react";

import { cn } from "@app/components/v3/utils";

const UnstableTable = React.forwardRef<
  HTMLDivElement,
  React.ComponentProps<"table"> & { containerClassName?: string }
>(({ className, containerClassName, ...props }, ref) => {
  return (
    <div
      ref={ref}
      data-slot="table-container"
      className={cn(
        "relative thin-scrollbar w-full overflow-x-auto rounded-md border border-border bg-container",
        containerClassName
      )}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  );
});

UnstableTable.displayName = "UnstableTable";

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
    <tbody
      data-slot="table-body"
      className={cn("[&>tr:last-child]:border-b-0 [&>tr:last-child>td]:border-b-0", className)}
      {...props}
    />
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
        "border-b border-border transition-colors duration-75 hover:bg-container-hover data-[state=selected]:bg-container-hover",
        props.onClick && "cursor-pointer",
        className
      )}
      {...props}
    />
  );
}

function UnstableTableHead({
  className,
  isTruncatable,
  ...props
}: React.ComponentProps<"th"> & { isTruncatable?: boolean }) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-[30px] border-x-0 border-t-0 border-b border-border px-3 text-left align-middle text-xs whitespace-nowrap text-accent [&:has([role=checkbox])]:pr-0",
        "has-[>svg]:cursor-pointer [&>svg]:ml-1 [&>svg]:inline-block [&>svg]:size-4",
        isTruncatable && "truncate",
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
        "h-[40px] border-b border-border px-3 align-middle whitespace-nowrap text-mineshaft-200 [&:has([role=checkbox])]:pr-0 [&>svg]:size-4",
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
