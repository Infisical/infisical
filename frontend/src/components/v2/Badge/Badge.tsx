import { forwardRef } from "react";
import { cva, VariantProps } from "cva";
import { twMerge } from "tailwind-merge";

interface IProps {
  children: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

const badgeVariants = cva(
  [
    "inline-block cursor-default rounded-md bg-yellow/20 px-1.5 pb-[0.03rem] pt-[0.04rem] text-xs text-yellow opacity-80 hover:opacity-100"
  ],
  {
    variants: {
      variant: {
        primary: "bg-yellow/20 text-yellow",
        danger: "bg-red/20 text-red",
        success: "bg-green/20 text-green"
      }
    }
  }
);

export type BadgeProps = VariantProps<typeof badgeVariants> & IProps;

export const Badge = forwardRef<HTMLDivElement, BadgeProps>(
  ({ children, className, variant, ...props }, ref) => {
    return (
      <div
        className={twMerge(badgeVariants({ variant: variant || "primary" }), className)}
        {...props}
        ref={ref}
      >
        {children}
      </div>
    );
  }
);
