import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { TReactQueryOptions } from "@app/types/reactQuery";

import {
  TGetSecretApprovalPoliciesDTO,
  TGetSecretApprovalPolicyOfBoardDTO,
  TSecretApprovalPolicy
} from "./types";

export const secretApprovalKeys = {
  getApprovalPolicies: (projectId: string) => [{ projectId }, "secret-approval-policies"] as const,
  getApprovalPolicyOfABoard: (projectId: string, environment: string, secretPath: string) => [
    { projectId, environment, secretPath },
    "Secret-approval-policy"
  ]
};

const fetchApprovalPolicies = async (projectId: string) => {
  const { data } = await apiRequest.get<{ approvals: TSecretApprovalPolicy[] }>(
    "/api/v2/secret-approvals",
    { params: { projectId } }
  );
  return data.approvals;
};

export const useGetSecretApprovalPolicies = ({
  projectId,
  options = {}
}: TGetSecretApprovalPoliciesDTO & TReactQueryOptions) =>
  useQuery({
    queryKey: secretApprovalKeys.getApprovalPolicies(projectId),
    queryFn: () => fetchApprovalPolicies(projectId),
    ...options,
    enabled: Boolean(projectId) && (options?.enabled ?? true)
  });

const fetchApprovalPolicyOfABoard = async (
  projectId: string,
  environment: string,
  secretPath: string
) => {
  const { data } = await apiRequest.get<{ policy: TSecretApprovalPolicy }>(
    "/api/v2/secret-approvals/board",
    { params: { projectId, environment, secretPath } }
  );
  return data.policy || "";
};

export const useGetSecretApprovalPolicyOfABoard = ({
  projectId,
  secretPath = "/",
  environment,
  options = {}
}: TGetSecretApprovalPolicyOfBoardDTO & TReactQueryOptions) =>
  useQuery({
    queryKey: secretApprovalKeys.getApprovalPolicyOfABoard(projectId, environment, secretPath),
    queryFn: () => fetchApprovalPolicyOfABoard(projectId, environment, secretPath),
    ...options,
    enabled: Boolean(projectId && secretPath && environment) && (options?.enabled ?? true)
  });
