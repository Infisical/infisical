import { ProjectType } from "@app/hooks/api/projects/types";

// Products that live at /organizations/$orgId/<slug> over a single implicit project, with no
// $projectId in the URL. Adding one here is most of what a new org-scoped product needs on the
// frontend, alongside a field on Organization and a layout beforeLoad.
//
// Keep this module free of anything that reaches @app/config/request: helpers/project.ts builds a
// regex from these slugs at module scope, and config/request sits in an import cycle back to
// helpers/project.ts, so a request-carrying dependency here can leave that regex in TDZ.
export type TOrgScopedProductType = ProjectType.PAM | ProjectType.AgentVault;

export type TOrgScopedProduct = {
  type: TOrgScopedProductType;
  // First segment after /organizations/$orgId, and the /api/v1/<slug>/project bootstrap route.
  slug: string;
  projectIdField: "pamProjectId" | "agentVaultProjectId";
};

export const PAM_PRODUCT: TOrgScopedProduct = {
  type: ProjectType.PAM,
  slug: "pam",
  projectIdField: "pamProjectId"
};

export const AGENT_VAULT_PRODUCT: TOrgScopedProduct = {
  type: ProjectType.AgentVault,
  slug: "agent-vault",
  projectIdField: "agentVaultProjectId"
};

export const ORG_SCOPED_PRODUCTS: Partial<Record<ProjectType, TOrgScopedProduct>> = {
  [ProjectType.PAM]: PAM_PRODUCT,
  [ProjectType.AgentVault]: AGENT_VAULT_PRODUCT
};

export const getOrgScopedProduct = (type: ProjectType): TOrgScopedProduct | undefined =>
  ORG_SCOPED_PRODUCTS[type];

export const ORG_SCOPED_PRODUCT_SLUGS = Object.values(ORG_SCOPED_PRODUCTS).map(({ slug }) => slug);
