import { useSuspenseQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";

import { fetchOrgSubscription, subscriptionQueryKeys } from "@app/hooks/api/subscriptions/queries";

export const useSubscription = () => {
  const organizationId = useRouteContext({
    from: "/_authenticate/_inject-org-details",
    select: (el) => el.organizationId
  });

  const { data: subscription } = useSuspenseQuery({
    queryKey: subscriptionQueryKeys.getOrgSubsription(organizationId),
    queryFn: () => fetchOrgSubscription(organizationId),
    staleTime: Infinity
  });

  return { subscription };
};
