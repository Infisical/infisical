import { ReactElement } from "react";
import { cva, type VariantProps } from "cva";
import { BoxesIcon as NamespaceIcon, Building2Icon as OrgIcon } from "lucide-react";

import { cn } from "@app/components/v3/utils";

const scopeBadgeVariants = cva(
  "inline-flex items-center justify-center border shrink-0 gap-1 [&>svg]:pointer-events-none overflow-hidden",
  {
    variants: {
      variant: {
        org: "border-org/75 bg-org/30 text-foreground",
        namespace: "border-namespace/75 bg-namespace/30 text-foreground"
      },
      size: {
        sm: "[&>svg]:stroke-[1.5] [&>svg]:size-5 p-0.5 rounded-[2px]",
        md: "[&>svg]:stroke-[1.5] [&>svg]:size-6 p-1 rounded-[3px]",
        lg: "[&>svg]:stroke-[1.5] [&>svg]:size-7 p-1 rounded-[4px]"
      }
    },
    defaultVariants: {
      variant: "org",
      size: "md"
    }
  }
);

type ScopeBadgeVariantProps = VariantProps<typeof scopeBadgeVariants>;

type ScopeBadgeProps = Omit<ScopeBadgeVariantProps, "variant"> & {
  variant: NonNullable<ScopeBadgeVariantProps["variant"]>;
  className?: string;
};

const ScopeIconMap: Record<NonNullable<ScopeBadgeProps["variant"]>, ReactElement> = {
  org: <OrgIcon />,
  namespace: <NamespaceIcon />
};

function ScopeBadge({ className, variant, size, ...props }: ScopeBadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(scopeBadgeVariants({ variant, size }), className)}
      {...props}
    >
      {ScopeIconMap[variant]}
    </span>
  );
}

export {
  NamespaceIcon,
  OrgIcon,
  ScopeBadge,
  type ScopeBadgeProps,
  scopeBadgeVariants,
  ScopeIconMap
};
