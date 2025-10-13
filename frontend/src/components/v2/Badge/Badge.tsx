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
    "inline-block cursor-default rounded-md bg-yellow/20 px-1.5 py-0.5 text-xs text-yellow opacity-80 hover:opacity-100"
  ],
  {
    variants: {
      variant: {
        primary: "bg-yellow/20 text-yellow",
        danger: "bg-red/20 text-red",
        success: "bg-green/20 text-green",
        org: "bg-org-v1/20 text-org-v1 [&_svg]:text-org-v1 flex items-center opacity-100 hover:bg-org-v1/10 [&_svg]:size-3 gap-x-1 w-min whitespace-nowrap",
        namespace:
          "bg-namespace-v1/20 text-namespace-v1 [&_svg]:text-namespace-v1 flex opacity-100 hover:bg-namespace-v1/10 items-center [&_svg]:size-3.5 gap-x-1 w-min whitespace-nowrap",
        project:
          "bg-primary/10 text-primary [&_svg]:text-primary opacity-100 hover:bg-primary/10 flex items-center [&_svg]:size-3 gap-x-1 w-min whitespace-nowrap",
        instance:
          "bg-mineshaft-200/20 text-mineshaft-200 [&_svg]:text-mineshaft-200 opacity-100 hover:bg-mineshaft-200/20 flex items-center [&_svg]:size-3 gap-x-1 w-min whitespace-nowrap"
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
