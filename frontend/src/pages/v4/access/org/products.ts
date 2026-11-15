import { AGENT_VAULT_PRODUCT_ROLE_OPTIONS, PAM_PRODUCT_ROLE_OPTIONS } from "@app/helpers/roles";
import { ProjectType } from "@app/hooks/api/projects/types";

import { useV4Adapter } from "../../data/adapters";
import { useOrgId } from "../permissions";

export type RoleOption = { value: string; label: string; description?: string };

export type Product = { type: ProjectType; isSingleton: boolean; roles?: readonly RoleOption[] };

const CERT_MANAGER_ROLES: RoleOption[] = [
  {
    value: "admin",
    label: "Admin",
    description: "Full administrative access over Certificate Manager"
  },
  {
    value: "member",
    label: "Member",
    description: "Only the applications and code signers they're added to"
  }
];

export const PRODUCTS: Product[] = [
  { type: ProjectType.SecretManager, isSingleton: false },
  { type: ProjectType.CertificateManager, isSingleton: true, roles: CERT_MANAGER_ROLES },
  { type: ProjectType.KMS, isSingleton: false },
  { type: ProjectType.SecretScanning, isSingleton: false },
  { type: ProjectType.PAM, isSingleton: true, roles: PAM_PRODUCT_ROLE_OPTIONS },
  { type: ProjectType.AgentVault, isSingleton: true, roles: AGENT_VAULT_PRODUCT_ROLE_OPTIONS }
];

export const builtInProjectRoles = (type?: ProjectType): RoleOption[] => [
  { value: "admin", label: "Admin", description: "Full administrative access over a project" },
  { value: "member", label: "Member", description: "Limited read and write access" },
  ...(type === ProjectType.KMS
    ? [
        {
          value: "cryptographic-operator",
          label: "Cryptographic Operator",
          description: "Cryptographic operations such as encryption and signing"
        }
      ]
    : []),
  { value: "viewer", label: "Viewer", description: "Read-only access" },
  {
    value: "no-access",
    label: "No Access",
    description: "No access to project resources"
  }
];

const SINGLE_PROJECT_PRODUCTS: string[] = [
  ProjectType.CertificateManager,
  ProjectType.SecretScanning,
  ProjectType.PAM
];

// Legacy orgs can still hold several Certificate Manager or Secret Scanning projects, so a membership
// is named by its product only while the org has one of them.
export const useIsNamedByProduct = () => {
  const orgId = useOrgId();
  const { data: certManager } = useV4Adapter("certificates").useInstanceState(orgId);
  const { data: secretScanning } = useV4Adapter("secretScanning").useInstanceState(orgId);
  return (type: string) => {
    if (!SINGLE_PROJECT_PRODUCTS.includes(type)) return false;
    if (type === ProjectType.CertificateManager) return certManager?.isMultiInstance === false;
    if (type === ProjectType.SecretScanning) return secretScanning?.isMultiInstance === false;
    return true;
  };
};
