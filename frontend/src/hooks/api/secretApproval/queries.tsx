import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { TReactQueryOptions } from "@app/types/reactQuery";

import {
  TApprovalPolicyApproverOptions,
  TGetSecretApprovalPoliciesDTO,
  TGetSecretApprovalPolicyOfBoardDTO,
  TSecretApprovalPolicy
} from "./types";

export const secretApprovalKeys = {
  getApprovalPolicies: (projectId: string) => [{ projectId }, "secret-approval-policies"] as const,
  getApproverOptions: (projectId: string) =>
    [{ projectId }, "approval-policy-approver-options"] as const,
  getApprovalPolicyOfABoard: (projectId: string, environment: string, secretPath: string) => [
    { projectId, environment, secretPath },
    "Secret-approval-policy"
  ]
};

export const useGetApprovalPolicyApproverOptions = ({
  projectId,
  options = {}
}: TGetSecretApprovalPoliciesDTO & TReactQueryOptions) =>
  useQuery({
    queryKey: secretApprovalKeys.getApproverOptions(projectId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TApprovalPolicyApproverOptions>(
        "/api/v2/secret-approvals/approver-options",
        { params: { projectId } }
      );
      return data;
    },
    ...options,
    enabled: Boolean(projectId) && (options?.enabled ?? true)
  });

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
