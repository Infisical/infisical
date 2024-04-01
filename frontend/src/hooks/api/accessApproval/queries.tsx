import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TAccessApprovalPolicy, TGetSecretApprovalPoliciesDTO } from "./types";

export const accessApprovalKeys = {
  getAccessApprovalPolicies: (workspaceId: string) =>
    [{ workspaceId }, "access-approval-policies"] as const,
  getAccessApprovalPolicyOfABoard: (workspaceId: string, environment: string) => [
    { workspaceId, environment },
    "access-approval-policy"
  ]
};

const fetchApprovalPolicies = async (workspaceId: string) => {
  const { data } = await apiRequest.get<{ approvals: TAccessApprovalPolicy[] }>(
    "/api/v1/access-approvals",
    { params: { workspaceId } }
  );
  return data.approvals;
};

export const useGetAccessApprovalPolicies = ({
  workspaceId,
  options = {}
}: TGetSecretApprovalPoliciesDTO & {
  options?: UseQueryOptions<
    TAccessApprovalPolicy[],
    unknown,
    TAccessApprovalPolicy[],
    ReturnType<typeof accessApprovalKeys.getAccessApprovalPolicies>
  >;
}) =>
  useQuery({
    queryKey: accessApprovalKeys.getAccessApprovalPolicies(workspaceId),
    queryFn: () => fetchApprovalPolicies(workspaceId),
    ...options,
    enabled: Boolean(workspaceId) && (options?.enabled ?? true)
  });
