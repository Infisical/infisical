import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { SubscriptionPlan, SubscriptionProductCategory } from "./types";

// import { Workspace } from './types';

export const subscriptionQueryKeys = {
  all: () => ["plan"] as const,
  getOrgSubsription: (orgID: string) => [...subscriptionQueryKeys.all(), { orgID }] as const
};

export const fetchOrgSubscription = async (orgID: string, refreshCache: boolean = false) => {
  const { data } = await apiRequest.get<{ plan: SubscriptionPlan }>(
    `/api/v1/organizations/${orgID}/plan${refreshCache ? "?refreshCache=true" : ""}`
  );

  return data.plan;
};

type UseGetOrgSubscriptionProps = {
  orgID: string;
};

export const useGetOrgSubscription = ({ orgID }: UseGetOrgSubscriptionProps) =>
  useQuery({
    queryKey: subscriptionQueryKeys.getOrgSubsription(orgID),
    queryFn: () => fetchOrgSubscription(orgID),
    enabled: Boolean(orgID),
    select: (featureSet) => ({
      productPlans: featureSet.productPlans,
      getAll: () => featureSet,
      get: <C extends SubscriptionProductCategory, K extends keyof SubscriptionPlan[C]>(
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
          // @ts-expect-error  this is ok
          return featureSet?.[featureKey];
        }

        return feature;
      }
    })
  });
