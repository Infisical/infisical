import { forwardRef, ReactNode } from "react";
import { twMerge } from "tailwind-merge";

export type CardTitleProps = {
  children: ReactNode;
  subTitle?: ReactNode;
  className?: string;
};

export const CardTitle = ({ children, className, subTitle }: CardTitleProps) => (
  <div
    className={twMerge(
      "px-6 py-4 mb-5 font-sans text-lg font-normal border-b border-mineshaft-600 break-words",
      className
    )}
  >
    {children}
    {subTitle && <p className="pt-2 text-sm font-normal text-gray-400">{subTitle}</p>}
  </div>
);

export type CardFooterProps = {
  children: ReactNode;
  className?: string;
};

export const CardFooter = ({ children, className }: CardFooterProps) => (
  <div className={twMerge("p-4 pt-0", className)}>{children}</div>
);

export type CardBodyProps = {
  children: ReactNode;
  className?: string;
};

export const CardBody = ({ children, className }: CardBodyProps) => (
  <div className={twMerge("px-6 pb-6 pt-0", className)}>{children}</div>
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
          "flex w-full flex-col bg-mineshaft-800 font-inter text-gray-200 shadow-md",
          isFullHeight && "h-full",
          isRounded && "rounded-md",
          isPlain && "shadow-none",
          isHoverable && "hover:shadow-xl",
          className
        )}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";
