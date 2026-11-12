import { ProjectType } from "@app/hooks/api/projects/types";

const SINGLE_PROJECT_PRODUCTS: string[] = [
  ProjectType.CertificateManager,
  ProjectType.SecretScanning,
  ProjectType.PAM
];

export const isSingleProjectProduct = (type: string) => SINGLE_PROJECT_PRODUCTS.includes(type);
