import { ReactElement } from "react";
import { cva, type VariantProps } from "cva";
import {
  FileBadgeIcon as CertManagementIcon,
  KeyRoundIcon as KmsIcon,
  RadarIcon as SecretScanningIcon,
  ShieldUserIcon as PamIcon,
  TerminalIcon as SshIcon,
  VaultIcon as SecretsManagementIcon
} from "lucide-react";

import { cn } from "@app/components/v3/utils";

const productBadgeVariants = cva(
  "inline-flex items-center justify-center border shrink-0 gap-1 [&>svg]:pointer-events-none overflow-hidden",
  {
    variants: {
      variant: {
        "secrets-manager": "border-secret-manager/75 bg-secret-manager/30 text-foreground",
        "secret-scanning": "border-secret-scanning/75 bg-secret-scanning/30 text-foreground",
        "cert-manager": "border-cert-manager/75 bg-cert-manager/30 text-foreground",
        ssh: "border-ssh/75 bg-ssh/30 text-foreground",
        pam: "border-pam/75 bg-pam/30 text-foreground",
        kms: "border-kms/75 bg-kms/30 text-foreground"
      },
      size: {
        sm: "[&>svg]:stroke-[1.5] [&>svg]:size-5 p-0.5 rounded-[2px]",
        md: "[&>svg]:stroke-[1.5] [&>svg]:size-6 p-1 rounded-[3px]",
        lg: "[&>svg]:stroke-[1.5] [&>svg]:size-7 p-1 rounded-[4px]"
      }
    },
    defaultVariants: {
      variant: "secrets-manager",
      size: "md"
    }
  }
);

type ProductBadgeVariantProps = VariantProps<typeof productBadgeVariants>;

type ProductBadgeProps = Omit<ProductBadgeVariantProps, "variant"> & {
  variant: NonNullable<ProductBadgeVariantProps["variant"]>;
  className?: string;
};

const ProductIconMap: Record<NonNullable<ProductBadgeProps["variant"]>, ReactElement> = {
  "secrets-manager": <SecretsManagementIcon />,
  "secret-scanning": <SecretScanningIcon />,
  "cert-manager": <CertManagementIcon />,
  ssh: <SshIcon />,
  kms: <KmsIcon />,
  pam: <PamIcon />
};

function ProductBadge({ className, variant, size, ...props }: ProductBadgeProps) {
  return (
    <span
      data-slot="badge"
      className={cn(productBadgeVariants({ variant, size }), className)}
      {...props}
    >
      {ProductIconMap[variant]}
    </span>
  );
}

export {
  CertManagementIcon,
  KmsIcon,
  PamIcon,
  ProductBadge,
  type ProductBadgeProps,
  productBadgeVariants,
  ProductIconMap,
  SecretScanningIcon,
  SecretsManagementIcon,
  SshIcon
};
