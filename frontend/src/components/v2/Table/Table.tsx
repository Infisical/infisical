import { HTMLAttributes, ReactNode, TdHTMLAttributes } from 'react';
import { twMerge } from 'tailwind-merge';

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
      'relative w-full overflow-x-auto border border-solid border-mineshaft-700 font-inter shadow-md',
      isRounded && 'rounded-md',
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
    className={twMerge(
      'w-full rounded rounded-md  bg-bunker-800 p-2 text-left text-sm text-gray-300',
      className
    )}
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
  <thead className={twMerge('bg-bunker text-xs uppercase text-bunker-300', className)}>
    {children}
  </thead>
);

// table rows
export type TrProps = {
  children: ReactNode;
  className?: string;
} & HTMLAttributes<HTMLTableRowElement>;

export const Tr = ({ children, className, ...props }: TrProps): JSX.Element => (
  <tr className={twMerge('border border-solid border-mineshaft-700 hover:bg-bunker-700', className)} {...props}>
    {children}
  </tr>
);

// table head columns
export type ThProps = {
  children?: ReactNode;
  className?: string;
};

export const Th = ({ children, className }: ThProps): JSX.Element => (
  <th className={twMerge('px-5 pt-4 pb-3.5 font-medium font-semibold bg-bunker-500', className)}>{children}</th>
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
  <td className={twMerge('px-5 py-2 text-left', className)} {...props}>
    {children}
  </td>
);
