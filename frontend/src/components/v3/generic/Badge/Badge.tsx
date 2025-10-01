import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "cva";

import { cn } from "@app/components/v3/utils";

const badgeVariants = cva(
  "inline-flex items-center [a&]:cursor-pointer justify-center rounded-[4px] border px-[6px] pt-[0.85px] pb-[0.15px] text-xs font-medium w-fit whitespace-nowrap shrink-0 gap-1 [&>svg]:pointer-events-none [&>svg]:stroke-[2.25] [&>svg]:mb-[0.75px] [&>svg]:size-3 overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "border-foreground bg-foreground text-background [a&]:hover:bg-foreground/90 [a&]:hover:border-foreground/90",
        accent:
          "border-accent/10 bg-accent/40 text-accent [a&]:hover:bg-accent/50 [a&]:hover:border-accent/20",
        outline:
          "text-foreground [a&]:hover:bg-foreground/20 border-foreground/50 hover:border-foreground",
        "secret-manager":
          "border-secret-manager/75 bg-secret-manager/40 text-foreground [a&]:hover:bg-secret-manager/50 [a&]:hover:border-secret-manager",
        "secret-scanning":
          "border-secret-scanning/75 bg-secret-scanning/40 text-foreground [a&]:hover:bg-secret-scanning/50 [a&]:hover:border-secret-scanning",
        "cert-manager":
          "border-cert-manager/75 bg-cert-manager/40 text-foreground [a&]:hover:bg-cert-manager/50 [a&]:hover:border-cert-manager",
        ssh: "border-ssh/75 bg-ssh/40 text-foreground [a&]:hover:bg-ssh/50 [a&]:hover:border-ssh",
        pam: "border-pam/75 bg-pam/40 text-foreground [a&]:hover:bg-pam/50 [a&]:hover:border-pam",
        kms: "border-kms/75 bg-kms/40 text-foreground [a&]:hover:bg-kms/50 [a&]:hover:border-kms",
        org: "border-org/75 bg-org/40 text-foreground [a&]:hover:bg-org/50 [a&]:hover:border-org",
        namespace:
          "border-namespace/75 bg-namespace/40 text-foreground [a&]:hover:bg-namespace/50 [a&]:hover:border-namespace",
        success:
          "border-success/75 bg-success/40 text-foreground [a&]:hover:bg-success/50 [a&]:hover:border-success",
        info: "border-info/75 bg-info/40 text-foreground [a&]:hover:bg-info/50 [a&]:hover:border-info",
        warning:
          "border-warning/75 bg-warning/40 text-foreground [a&]:hover:bg-warning/50 [a&]:hover:border-warning",
        danger:
          "border-danger/75 bg-danger/40 text-foreground [a&]:hover:bg-danger/50 [a&]:hover:border-danger"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

type BadgeProps = React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    asChild?: boolean;
  };

function Badge({ className, variant, asChild = false, ...props }: BadgeProps) {
  const Comp = asChild ? Slot : "span";
  return (
    <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, type BadgeProps, badgeVariants };
