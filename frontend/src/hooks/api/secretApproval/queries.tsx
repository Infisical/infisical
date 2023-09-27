import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TSecretApprovalPolicy } from "./types";

export const secretApprovalKeys = {
  getApprovalPolicies: (workspaceId: string) =>
    [{ workspaceId }, "secret-approval-policies"] as const
};

const fetchApprovalPolicies = async (workspaceId: string) => {
  const { data } = await apiRequest.get<{ approvals: TSecretApprovalPolicy[] }>(
    "/api/v1/secret-approvals",
    { params: { workspaceId } }
  );
  return data.approvals;
};

export const useGetSecretApprovalPolicies = ({
  workspaceId,
  options = {}
}: { workspaceId: string } & {
  options?: UseQueryOptions<
    TSecretApprovalPolicy[],
    unknown,
    TSecretApprovalPolicy[],
    ReturnType<typeof secretApprovalKeys.getApprovalPolicies>
  >;
}) =>
  useQuery({
    queryKey: secretApprovalKeys.getApprovalPolicies(workspaceId),
    queryFn: () => fetchApprovalPolicies(workspaceId),
    ...options,
    enabled: Boolean(workspaceId) && (options?.enabled ?? true)
  });
