import { useLocation } from "@tanstack/react-router";

import { useOrganization } from "@app/context/OrganizationContext";
import { getOrgScopedProduct } from "@app/helpers/orgScopedProducts";
import { getOrgScopedProductFromPath } from "@app/helpers/project";

// Selecting on the derived product keeps the ~100 useProject callers from re-rendering on every
// search-param change.
export const useImplicitProjectId = () => {
  const product = useLocation({
    select: (location) => getOrgScopedProductFromPath(location.pathname)
  });
  const { currentOrg } = useOrganization();

  const orgScopedProduct = product ? getOrgScopedProduct(product) : undefined;
  return orgScopedProduct ? currentOrg[orgScopedProduct.projectIdField] : null;
};
