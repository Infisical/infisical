import { useCallback, useMemo } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";

import { fetchOrgSubscription, subscriptionQueryKeys } from "@app/hooks/api/subscriptions/queries";
import { SubscriptionPlan, SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";

export const useSubscription = (refreshCache?: boolean) => {
  const organizationId = useRouteContext({
    from: "/_authenticate/_inject-org-details",
    select: (el) => el.organizationId
  });

  const { data: featureSet } = useSuspenseQuery({
    queryKey: subscriptionQueryKeys.getOrgSubsription(organizationId),
    queryFn: () => fetchOrgSubscription(organizationId, refreshCache),
    staleTime: Infinity
  });

  const get = useCallback(
    <C extends SubscriptionProductCategory, K extends keyof SubscriptionPlan[C]>(
      category: C,
      featureKey: K
    ): SubscriptionPlan[C][K] | undefined => {
      const feature = featureSet?.[category]?.[featureKey];

      if (
        !feature &&
        (category === SubscriptionProductCategory.Platform ||
          category === SubscriptionProductCategory.SecretManager) &&
        featureKey in featureSet
      ) {
        // @ts-expect-error this is ok
        return featureSet?.[featureKey];
      }

      return feature;
    },
    [featureSet]
  );

  const subscription = useMemo(
    () => ({
      version: featureSet.version,
      slug: featureSet.slug,
      status: featureSet.status,
      cardDeclined: featureSet.cardDeclined,
      cardDeclinedReason: featureSet.cardDeclinedReason,
      cardDeclinedDays: featureSet.cardDeclinedDays,
      productPlans: featureSet?.productPlans,
      get
    }),
    [featureSet, get]
  );

  return { subscription };
};
