import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TGetSecretApprovalPoliciesDTO,
  TGetSecretApprovalPolicyOfBoardDTO,
  TSecretApprovalPolicy
} from "./types";

export const secretApprovalKeys = {
  getApprovalPolicies: (workspaceId: string) =>
    [{ workspaceId }, "secret-approval-policies"] as const,
  getApprovalPolicyOfABoard: (workspaceId: string, environment: string, secretPath: string) => [
    { workspaceId, environment, secretPath },
    "Secret-approval-policy"
  ]
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
}: TGetSecretApprovalPoliciesDTO & {
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

const fetchApprovalPolicyOfABoard = async (
  workspaceId: string,
  environment: string,
  secretPath: string
) => {
  const { data } = await apiRequest.get<{ policy: TSecretApprovalPolicy }>(
    "/api/v1/secret-approvals/board",
    { params: { workspaceId, environment, secretPath } }
  );
  return data.policy || "";
};

export const useGetSecretApprovalPolicyOfABoard = ({
  workspaceId,
  secretPath = "/",
  environment,
  options = {}
}: TGetSecretApprovalPolicyOfBoardDTO & {
  options?: UseQueryOptions<
    TSecretApprovalPolicy,
    unknown,
    TSecretApprovalPolicy,
    ReturnType<typeof secretApprovalKeys.getApprovalPolicyOfABoard>
  >;
}) =>
  useQuery({
    queryKey: secretApprovalKeys.getApprovalPolicyOfABoard(workspaceId, environment, secretPath),
    queryFn: () => fetchApprovalPolicyOfABoard(workspaceId, environment, secretPath),
    ...options,
    enabled: Boolean(workspaceId && secretPath && environment) && (options?.enabled ?? true)
  });
