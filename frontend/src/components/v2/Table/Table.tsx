import { ReactNode } from 'react';
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
      'overflow-x-auto shadow-md relative border border-solid border-mineshaft-700',
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
      'bg-bunker-800 p-2 roun  text-gray-300 w-full text-sm text-left rounded-md',
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
  <thead className={twMerge('text-xs bg-bunker text-bunker-300 uppercase', className)}>
    {children}
  </thead>
);

// table rows
export type TrProps = {
  children: ReactNode;
  className?: string;
};

export const Tr = ({ children, className }: TrProps): JSX.Element => (
  <tr className={twMerge('border border-solid border-mineshaft-700', className)}>{children}</tr>
);

// table head columns
export type ThProps = {
  children: ReactNode;
  className?: string;
};

export const Th = ({ children, className }: ThProps): JSX.Element => (
  <th className={twMerge('px-6 py-3 font-medium', className)}>{children}</th>
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
  children: ReactNode;
  className?: string;
};

export const Td = ({ children, className }: TdProps): JSX.Element => (
  <td className={twMerge('text-left px-6 py-3', className)}>{children}</td>
);
