import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { SubscriptionPlan } from "./types";

// import { Workspace } from './types';

export const subscriptionQueryKeys = {
  getOrgSubsription: (orgID: string) => ["plan", { orgID }] as const
};

export const fetchOrgSubscription = async (orgID: string) => {
  const { data } = await apiRequest.get<{ plan: SubscriptionPlan }>(
    `/api/v1/organizations/${orgID}/plan`
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
    enabled: Boolean(orgID)
  });
