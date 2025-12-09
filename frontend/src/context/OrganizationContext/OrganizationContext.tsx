import { useMemo } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";

import { fetchOrganizationById, organizationKeys } from "@app/hooks/api/organization/queries";

export const useOrganization = () => {
  const organizationId = useRouteContext({
    from: "/_authenticate/_inject-org-details",
    select: (el) => el.organizationId
  });

  const { data: currentOrg } = useSuspenseQuery({
    queryKey: organizationKeys.getOrgById(organizationId),
    queryFn: () => fetchOrganizationById(organizationId),
    staleTime: Infinity
  });
  const isSubOrganization = currentOrg.id !== currentOrg.rootOrgId && Boolean(currentOrg.rootOrgId);

  const org = useMemo(
    () => ({
      currentOrg: {
        ...currentOrg,
        parentOrgId: isSubOrganization ? currentOrg?.parentOrgId : null
      },
      isSubOrganization,
      isRootOrganization: !isSubOrganization
    }),
    [currentOrg]
  );

  return org;
};
