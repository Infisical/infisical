import { CSSProperties, forwardRef, ReactNode } from "react";
import { twMerge } from "tailwind-merge";

export type CardTitleProps = {
  children: ReactNode;
  subTitle?: ReactNode;
  className?: string;
};

export const CardTitle = ({ children, className, subTitle }: CardTitleProps) => (
  <div
    className={twMerge(
      "mb-5 break-words border-b border-mineshaft-600 px-6 py-4 font-sans text-lg font-normal",
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
  style?: CSSProperties;
};

export const CardBody = ({ children, className, style }: CardBodyProps) => (
  <div className={twMerge("px-6 pb-6 pt-0", className)} style={style}>
    {children}
  </div>
);

export type CardProps = {
  children: ReactNode;
  className?: string;
  isFullHeight?: boolean;
  isRounded?: boolean;
  isPlain?: boolean;
  isHoverable?: boolean;
  style?: CSSProperties;
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    { children, isFullHeight, isRounded, isHoverable, isPlain, className, style },
    ref
  ): JSX.Element => {
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
        style={style}
      >
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";
