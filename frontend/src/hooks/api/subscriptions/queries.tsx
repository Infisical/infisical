import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { SubscriptionPlan } from "./types";

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
    enabled: Boolean(orgID)
  });
