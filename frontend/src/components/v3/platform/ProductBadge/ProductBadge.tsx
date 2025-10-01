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
        "secrets-manager": "border-secret-manager/75 bg-secret-manager/40 text-foreground",
        "secret-scanning": "border-secret-scanning/75 bg-secret-scanning/40 text-foreground",
        "cert-manager": "border-cert-manager/75 bg-cert-manager/40 text-foreground",
        ssh: "border-ssh/75 bg-ssh/40 text-foreground",
        pam: "border-pam/75 bg-pam/40 text-foreground",
        kms: "border-kms/75 bg-kms/40 text-foreground"
      },
      size: {
        sm: "[&>svg]:stroke-[1.5] [&>svg]:size-[14px] p-[3px] rounded-[4px]",
        md: "[&>svg]:stroke-[1.5] [&>svg]:size-[18px] p-[3px] rounded-[4px]",
        lg: "[&>svg]:stroke-[1.5] [&>svg]:size-[22px] p-[3px] rounded-[4px]"
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
