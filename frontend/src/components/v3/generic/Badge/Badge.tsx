import { forwardRef } from "react";
import { Link, LinkProps } from "@tanstack/react-router";
import { cva, type VariantProps } from "cva";

import { cn } from "@app/components/v3/utils";

const badgeVariants = cva(
  cn(
    "inline-flex select-none items-center [a&,button&]:cursor-pointer justify-center rounded-[4px] border px-[6px] pt-[0.85px] pb-[0.15px] text-xs w-fit whitespace-nowrap shrink-0 gap-1 overflow-hidden",
    "[&>svg]:pointer-events-none [&>svg]:stroke-[2.25] [&>svg]:mb-[0.75px] [&>svg]:size-3"
  ),
  {
    variants: {
      variant: {
        default:
          "border-foreground bg-foreground text-background [a&]:hover:bg-foreground/90 [a&]:hover:border-foreground/90 [button&]:hover:bg-foreground/90 [button&]:hover:border-foreground/90",
        accent:
          "border-accent/10 bg-accent/30 text-accent [a&]:hover:bg-accent/40 [a&]:hover:border-accent/20 [button&]:hover:bg-accent/40 [button&]:hover:border-accent/20",
        outline:
          "text-foreground border-foreground/40 [a&]:hover:border-foreground [a&]:hover:bg-foreground/20",
        "secret-manager":
          "border-secret-manager/75 bg-secret-manager/30 text-foreground [a&]:hover:bg-secret-manager/40 [a&]:hover:border-secret-manager [button&]:hover:bg-secret-manager/40 [button&]:hover:border-secret-manager",
        "secret-scanning":
          "border-secret-scanning/75 bg-secret-scanning/30 text-foreground [a&]:hover:bg-secret-scanning/40 [a&]:hover:border-secret-scanning [button&]:hover:bg-secret-scanning/40 [button&]:hover:border-secret-scanning",
        "cert-manager":
          "border-cert-manager/75 bg-cert-manager/30 text-foreground [a&]:hover:bg-cert-manager/40 [a&]:hover:border-cert-manager [button&]:hover:bg-cert-manager/40 [button&]:hover:border-cert-manager",
        ssh: "border-ssh/75 bg-ssh/30 text-foreground [a&]:hover:bg-ssh/40 [a&]:hover:border-ssh [button&]:hover:bg-ssh/40 [button&]:hover:border-ssh",
        pam: "border-pam/75 bg-pam/30 text-foreground [a&]:hover:bg-pam/40 [a&]:hover:border-pam [button&]:hover:bg-pam/40 [button&]:hover:border-pam",
        kms: "border-kms/75 bg-kms/30 text-foreground [a&]:hover:bg-kms/40 [a&]:hover:border-kms [button&]:hover:bg-kms/40 [button&]:hover:border-kms",
        org: "border-org/75 bg-org/30 text-foreground [a&]:hover:bg-org/40 [a&]:hover:border-org [button&]:hover:bg-org/40 [button&]:hover:border-org",
        namespace:
          "border-namespace/75 bg-namespace/30 text-foreground [a&]:hover:bg-namespace/40 [a&]:hover:border-namespace [button&]:hover:bg-namespace/40 [button&]:hover:border-namespace",
        success:
          "border-success/75 bg-success/30 text-foreground [a&]:hover:bg-success/40 [a&]:hover:border-success [button&]:hover:bg-success/40 [button&]:hover:border-success",
        info: "border-info/75 bg-info/30 text-foreground [a&]:hover:bg-info/40 [a&]:hover:border-info [button&]:hover:bg-info/40 [button&]:hover:border-info",
        warning:
          "border-warning/75 bg-warning/30 text-foreground [a&]:hover:bg-warning/40 [a&]:hover:border-warning [button&]:hover:bg-warning/40 [button&]:hover:border-warning",
        danger:
          "border-danger/75 bg-danger/30 text-foreground [a&]:hover:bg-danger/40 [a&]:hover:border-danger [button&]:hover:bg-danger/40 [button&]:hover:border-danger"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

type BadgeProps = VariantProps<typeof badgeVariants> &
  (
    | ({
        as?: "span" | undefined;
      } & React.ComponentProps<"span">)
    | ({
        as: "button";
      } & React.ComponentProps<"button">)
    | ({
        as: "a";
      } & React.ComponentProps<"a">)
    | ({
        as: "link";
        className?: string;
      } & LinkProps)
  );

const Badge = forwardRef<HTMLButtonElement | HTMLSpanElement | HTMLAnchorElement, BadgeProps>(
  ({ className, variant, ...props }, ref): JSX.Element => {
    const sharedProps = {
      "data-slot": "badge",
      className: cn(badgeVariants({ variant }), className)
    };

    switch (props.as) {
      case "button":
        return (
          <button
            ref={ref as React.Ref<HTMLButtonElement>}
            type="button"
            {...sharedProps}
            {...props}
          />
        );
      case "a":
        return (
          // eslint-disable-next-line jsx-a11y/anchor-has-content
          <a
            ref={ref as React.Ref<HTMLAnchorElement>}
            target="_blank"
            rel="noopener noreferrer"
            {...sharedProps}
            {...props}
          />
        );
      case "link":
        return <Link ref={ref as React.Ref<HTMLAnchorElement>} {...sharedProps} {...props} />;
      default:
        return <span ref={ref as React.Ref<HTMLSpanElement>} {...sharedProps} {...props} />;
    }
  }
);

Badge.displayName = "Badge";

export { Badge, type BadgeProps, badgeVariants };
