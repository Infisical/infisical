import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { SubscriptionPlan } from "./types";

// import { Workspace } from './types';

export const subscriptionQueryKeys = {
  getOrgSubscription: (orgID: string) => ["plan", { orgID }] as const
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
    queryKey: subscriptionQueryKeys.getOrgSubscription(orgID),
    queryFn: () => fetchOrgSubscription(orgID),
    enabled: Boolean(orgID)
  });
