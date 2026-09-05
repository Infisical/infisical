import { LucideIcon } from "lucide-react";

import { getProjectLucideIcon } from "@app/helpers/project";
import { ProjectType } from "@app/hooks/api/projects/types";

export type SignupProductType =
  | ProjectType.SecretManager
  | ProjectType.CertificateManager
  | ProjectType.KMS
  | ProjectType.PAM
  | ProjectType.AgentVault
  | ProjectType.SecretScanning;

export const EXPLORING_SELECTION = "exploring" as const;

export type SignupProductSelection = SignupProductType | typeof EXPLORING_SELECTION;

export type SignupProductMeta = {
  type: SignupProductType;
  name: string;
  description: string;
  /** Summary-page subline. PKI and PAM are single-instance, so their copy must not mention projects. */
  completedDescription: string;
  icon: LucideIcon;
  // Class strings are written out per product (not interpolated) so Tailwind's scanner emits them.
  iconClassName: string;
  tileClassName: string;
  selectedCardClassName: string;
  radioClassName: string;
  dotClassName: string;
};

export const SIGNUP_PRODUCTS: SignupProductMeta[] = [
  {
    type: ProjectType.SecretManager,
    name: "Secrets Management",
    description:
      "Centralize secrets across environments with syncs, rotation, and dynamic credentials.",
    completedDescription: "Your first project is created. Jump in and add your first resources.",
    icon: getProjectLucideIcon(ProjectType.SecretManager),
    iconClassName: "text-product-sm",
    tileClassName: "border-product-sm/30 bg-gradient-to-br from-product-sm/20 to-product-sm/5",
    selectedCardClassName: "border-product-sm/50 bg-product-sm/[0.04]",
    radioClassName: "border-product-sm",
    dotClassName: "bg-product-sm"
  },
  {
    type: ProjectType.CertificateManager,
    name: "Certificate Management (PKI)",
    description: "Issue, rotate, and govern X.509 certificates for TLS, mTLS, and code signing.",
    completedDescription: "Everything is ready. Jump in and issue your first certificates.",
    icon: getProjectLucideIcon(ProjectType.CertificateManager),
    iconClassName: "text-product-pki",
    tileClassName: "border-product-pki/30 bg-gradient-to-br from-product-pki/20 to-product-pki/5",
    selectedCardClassName: "border-product-pki/50 bg-product-pki/[0.04]",
    radioClassName: "border-product-pki",
    dotClassName: "bg-product-pki"
  },
  {
    type: ProjectType.KMS,
    name: "KMS",
    description: "Generate, store, and use cryptographic keys to encrypt, sign, and verify.",
    completedDescription: "Your first project is created. Jump in and add your first resources.",
    icon: getProjectLucideIcon(ProjectType.KMS),
    iconClassName: "text-product-kms",
    tileClassName: "border-product-kms/30 bg-gradient-to-br from-product-kms/20 to-product-kms/5",
    selectedCardClassName: "border-product-kms/50 bg-product-kms/[0.04]",
    radioClassName: "border-product-kms",
    dotClassName: "bg-product-kms"
  },
  {
    type: ProjectType.PAM,
    name: "Privileged Access Management",
    description: "Secure access to databases and servers with session brokering and recording.",
    completedDescription: "Everything is ready. Jump in and connect your first resources.",
    icon: getProjectLucideIcon(ProjectType.PAM),
    iconClassName: "text-product-pam",
    tileClassName: "border-product-pam/30 bg-gradient-to-br from-product-pam/20 to-product-pam/5",
    selectedCardClassName: "border-product-pam/50 bg-product-pam/[0.04]",
    radioClassName: "border-product-pam",
    dotClassName: "bg-product-pam"
  },
  {
    type: ProjectType.AgentVault,
    name: "Agent Vault",
    description: "Run AI agents with the access, context, and capabilities they need to do work.",
    completedDescription: "Everything is ready. Jump in and create your first access bundle.",
    icon: getProjectLucideIcon(ProjectType.AgentVault),
    iconClassName: "text-product-av",
    tileClassName: "border-product-av/30 bg-gradient-to-br from-product-av/20 to-product-av/5",
    selectedCardClassName: "border-product-av/50 bg-product-av/[0.04]",
    radioClassName: "border-product-av",
    dotClassName: "bg-product-av"
  },
  {
    type: ProjectType.SecretScanning,
    name: "Secret Scanning",
    description: "Continuously scan repos, builds, and artifacts for leaked secrets.",
    completedDescription: "Your first project is created. Jump in and add your first resources.",
    icon: getProjectLucideIcon(ProjectType.SecretScanning),
    iconClassName: "text-product-ss",
    tileClassName: "border-product-ss/30 bg-gradient-to-br from-product-ss/20 to-product-ss/5",
    selectedCardClassName: "border-product-ss/50 bg-product-ss/[0.04]",
    radioClassName: "border-product-ss",
    dotClassName: "bg-product-ss"
  }
];

export const getSignupProduct = (
  selection: SignupProductSelection | null | undefined
): SignupProductMeta | undefined => SIGNUP_PRODUCTS.find((product) => product.type === selection);
