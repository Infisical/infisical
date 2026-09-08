import { apiRequest } from "@app/config/request";
import { TOrgScopedProduct } from "@app/helpers/orgScopedProducts";
import { Organization } from "@app/hooks/api/organization/types";

// Resolves the org's project for this product, creating it on first access (lazy bootstrap on the
// backend).
export const fetchOrgScopedProjectId = async ({ slug }: TOrgScopedProduct) => {
  const { data } = await apiRequest.get<{ projectId: string }>(`/api/v1/${slug}/project`);
  return data.projectId;
};

// For imperative (non-hook) callers; skips the fetch when the org already carries the id.
export const resolveOrgScopedProjectId = async (
  org: Pick<Organization, "pamProjectId" | "agentVaultProjectId"> | undefined,
  product: TOrgScopedProduct
) => org?.[product.projectIdField] ?? fetchOrgScopedProjectId(product);
