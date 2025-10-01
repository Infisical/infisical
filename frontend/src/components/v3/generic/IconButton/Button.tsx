import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "cva";

import { cn } from "@app/components/v3/utils";

const buttonVariants = cva(
  "inline-flex items-center active:scale-[0.99] justify-center border cursor-pointer gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&>svg]:stroke-[1.5] [&>svg]:mb-[2px] shrink-0 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border-foreground bg-foreground text-background hover:bg-foreground/90 hover:border-foreground/90",
        accent:
          "border-accent/10 bg-accent/40 text-foreground hover:bg-accent/50 hover:border-accent/20",
        outline:
          "text-foreground hover:bg-foreground/20 border-foreground/50 hover:border-foreground",
        ghost: "text-foreground hover:bg-foreground/40 border-transparent",
        "secret-manager":
          "border-secret-manager/75 bg-secret-manager/40 text-foreground hover:bg-secret-manager/50 hover:border-secret-manager",
        "secret-scanning":
          "border-secret-scanning/75 bg-secret-scanning/40 text-foreground hover:bg-secret-scanning/50 hover:border-secret-scanning",
        "cert-manager":
          "border-cert-manager/75 bg-cert-manager/40 text-foreground hover:bg-cert-manager/50 hover:border-cert-manager",
        ssh: "border-ssh/75 bg-ssh/40 text-foreground hover:bg-ssh/50 hover:border-ssh",
        pam: "border-pam/75 bg-pam/40 text-foreground hover:bg-pam/50 hover:border-pam",
        kms: "border-kms/75 bg-kms/40 text-foreground hover:bg-kms/50 hover:border-kms",
        org: "border-org/75 bg-org/40 text-foreground hover:bg-org/50 hover:border-org",
        namespace:
          "border-namespace/75 bg-namespace/40 text-foreground hover:bg-namespace/50 hover:border-namespace",
        success:
          "border-success/75 bg-success/40 text-foreground hover:bg-success/50 hover:border-success",
        info: "border-info/75 bg-info/40 text-foreground hover:bg-info/50 hover:border-info",
        warning:
          "border-warning/75 bg-warning/40 text-foreground hover:bg-warning/50 hover:border-warning",
        danger:
          "border-danger/75 bg-danger/40 text-foreground hover:bg-danger/50 hover:border-danger"
      },
      size: {
        sm: "h-8 px-3 pt-[4px] pb-[2px]",
        md: "h-9 px-4 pt-[5px] pb-[3px]",
        lg: "h-10 px-5 pt-[6px] pb-[4px]"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "md"
    }
  }
);

type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, type ButtonProps, buttonVariants };
