import { HTMLAttributes, ReactNode, TdHTMLAttributes } from "react";
import { twMerge } from "tailwind-merge";

import { Skeleton } from "../Skeleton";

export type TableContainerProps = {
  children: ReactNode;
  isRounded?: boolean;
  className?: string;
};

export const TableContainer = ({
  children,
  className,
  isRounded = true
}: TableContainerProps): JSX.Element => (
  <div
    className={twMerge(
      "relative w-full overflow-x-auto border border-solid border-mineshaft-700 bg-mineshaft-800 font-inter",
      isRounded && "rounded-lg",
      className
    )}
  >
    {children}
  </div>
);

// main parent table
export type TableProps = {
  className?: string;
  children: ReactNode;
};

export const Table = ({ children, className }: TableProps): JSX.Element => (
  <table
    className={twMerge("w-full bg-mineshaft-800 p-2 text-left text-sm text-gray-300", className)}
  >
    {children}
  </table>
);

// table head
export type THeadProps = {
  children: ReactNode;
  className?: string;
};

export const THead = ({ children, className }: THeadProps): JSX.Element => (
  <thead className={twMerge("bg-mineshaft-800 text-xs uppercase text-bunker-300", className)}>
    {children}
  </thead>
);

export type TFootProps = {
  children: ReactNode;
  className?: string;
};

export const TFoot = ({ children, className }: TFootProps): JSX.Element => (
  <tfoot className={twMerge("bg-mineshaft-800 text-xs uppercase text-bunker-300", className)}>
    {children}
  </tfoot>
);

// table rows
export type TrProps = {
  children: ReactNode;
  className?: string;
  isHoverable?: boolean;
  isSelectable?: boolean;
} & HTMLAttributes<HTMLTableRowElement>;

export const Tr = ({
  children,
  className,
  isHoverable,
  isSelectable,
  ...props
}: TrProps): JSX.Element => (
  <tr
    className={twMerge(
      "cursor-default border-b border-solid border-mineshaft-600 last:border-b-0",
      isHoverable && "hover:bg-mineshaft-600",
      isSelectable && "cursor-pointer",
      className
    )}
    {...props}
  >
    {children}
  </tr>
);

// table head columns
export type ThProps = {
  children?: ReactNode;
  className?: string;
};

export const Th = ({ children, className }: ThProps): JSX.Element => (
  <th
    className={twMerge(
      "border-b-2 border-mineshaft-600 bg-mineshaft-800 px-5 pt-4 pb-3.5 font-semibold",
      className
    )}
  >
    {children}
  </th>
);

// table body
export type TBodyProps = {
  children: ReactNode;
  className?: string;
};

export const TBody = ({ children, className }: TBodyProps): JSX.Element => (
  <tbody className={twMerge(className)}>{children}</tbody>
);

// table body columns
export type TdProps = {
  children?: ReactNode;
  className?: string;
} & TdHTMLAttributes<HTMLTableCellElement>;

export const Td = ({ children, className, ...props }: TdProps): JSX.Element => (
  <td className={twMerge("px-5 py-3 text-left", className)} {...props}>
    {children}
  </td>
);

export type TBodyLoader = {
  rows?: number;
  columns: number;
  className?: string;
  // unique key for mapping
  innerKey: string;
};

export const TableSkeleton = ({
  rows = 3,
  columns,
  innerKey,
  className
}: TBodyLoader): JSX.Element => (
  <>
    {Array.apply(0, Array(rows)).map((_x, i) => (
      <Tr key={`${innerKey}-skeleton-rows-${i + 1}`}>
        {Array.apply(0, Array(columns)).map((_y, j) => (
          <Td key={`${innerKey}-skeleton-rows-${i + 1}-column-${j + 1}`}>
            <Skeleton className={className} />
          </Td>
        ))}
      </Tr>
    ))}
  </>
);
