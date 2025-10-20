import { useMemo } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useRouteContext, useSearch } from "@tanstack/react-router";

import { fetchOrganizationById, organizationKeys } from "@app/hooks/api/organization/queries";

export const useOrganization = () => {
  const organizationId = useRouteContext({
    from: "/_authenticate/_inject-org-details",
    select: (el) => el.organizationId
  });

  const subOrganization = useSearch({
    strict: false,
    select: (el) => el?.subOrganization
  });

  const { data: currentOrg } = useSuspenseQuery({
    queryKey: organizationKeys.getOrgById(organizationId, subOrganization),
    queryFn: () => fetchOrganizationById(organizationId),
    staleTime: Infinity
  });

  const org = useMemo(
    () => ({
      currentOrg: {
        ...currentOrg,
        id: currentOrg?.subOrganization?.id || currentOrg?.id,
        parentOrgId: currentOrg.id
      },
      isSubOrganization: Boolean(currentOrg.subOrganization),
      isRootOrganization: !currentOrg.subOrganization
    }),
    [currentOrg]
  );

  return org;
};
