import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '@app/config/request';

import { GetSubscriptionPlan } from './types';

// import { Workspace } from './types';

const subscriptionKeys = {
  getOrgSubsription: (orgID: string) => ['subscription', { orgID }] as const
};

const fetchOrgSubscription = async (orgID: string) => {
  const { data } = await apiRequest.get<{ subscriptions: GetSubscriptionPlan }>(
    `/api/v1/organization/${orgID}/subscriptions`
  );

  return data.subscriptions;
};

type UseGetOrgSubscriptionProps = {
  orgID: string;
};

export const useGetOrgSubscription = ({ orgID }: UseGetOrgSubscriptionProps) =>
  useQuery({
    queryKey: subscriptionKeys.getOrgSubsription(orgID),
    queryFn: () => fetchOrgSubscription(orgID),
    enabled: Boolean(orgID)
  });
