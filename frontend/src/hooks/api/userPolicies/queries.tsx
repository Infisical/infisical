import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TUserPolicy } from "./types";

export const userPolicyQueryKeys = {
  list: (projectId: string) => [{ projectId }, "user-policies"] as const,
  byId: (policyId: string) => [{ policyId }, "user-policy"] as const
};

const fetchUserPolicies = async (projectId: string) => {
  const { data } = await apiRequest.get<{ userPolicies: TUserPolicy[] }>("/api/v1/user-policies", {
    params: { projectId }
  });
  return data.userPolicies;
};

export const useGetUserPolicies = (projectId: string) =>
  useQuery({
    queryKey: userPolicyQueryKeys.list(projectId),
    queryFn: () => fetchUserPolicies(projectId),
    enabled: Boolean(projectId)
  });
