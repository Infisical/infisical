import { forwardRef, ReactNode } from 'react';
import { twMerge } from 'tailwind-merge';

export type CardTitleProps = {
  children: ReactNode;
  subTitle?: string;
  className?: string;
};

export const CardTitle = ({ children, className, subTitle }: CardTitleProps) => (
  <div className={twMerge('p-6 pb-4 font-sans text-xl font-medium', className)}>
    {children}
    {subTitle && <p className="py-1 text-sm font-normal text-gray-400">{subTitle}</p>}
  </div>
);

export type CardFooterProps = {
  children: ReactNode;
  className?: string;
};

export const CardFooter = ({ children, className }: CardFooterProps) => (
  <div className={twMerge('p-6 pt-0', className)}>{children}</div>
);

export type CardBodyProps = {
  children: ReactNode;
  className?: string;
};

export const CardBody = ({ children, className }: CardBodyProps) => (
  <div className={twMerge('p-6 pt-0', className)}>{children}</div>
);

export type CardProps = {
  children: ReactNode;
  className?: string;
  isFullHeight?: boolean;
  isRounded?: boolean;
  isPlain?: boolean;
  isHoverable?: boolean;
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ children, isFullHeight, isRounded, isHoverable, isPlain, className }, ref): JSX.Element => {
    return (
      <div
        ref={ref}
        className={twMerge(
          'flex flex-col w-full font-inter text-gray-200 bg-mineshaft-700 shadow-md',
          isFullHeight && 'h-full',
          isRounded && 'rounded-md',
          isPlain && 'shadow-none',
          isHoverable && 'hover:shadow-xl',
          className
        )}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = 'Card';
