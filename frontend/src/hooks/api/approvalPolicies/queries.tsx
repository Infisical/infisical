import { queryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TApprovalPolicy, TGetApprovalPolicyByIdDTO, TListApprovalPoliciesDTO } from "./types";

export const approvalPolicyQuery = {
  allKey: () => ["approval-policies"] as const,
  getByIdKey: (params: TGetApprovalPolicyByIdDTO) =>
    [...approvalPolicyQuery.allKey(), "by-id", params] as const,
  listKey: (params: TListApprovalPoliciesDTO) =>
    [...approvalPolicyQuery.allKey(), "list", params] as const,
  getById: (params: TGetApprovalPolicyByIdDTO) =>
    queryOptions({
      queryKey: approvalPolicyQuery.getByIdKey(params),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ policy: TApprovalPolicy }>(
          `/api/v1/approval-policies/${params.policyType}/${params.policyId}`
        );
        return data.policy;
      }
    }),
  list: (params: TListApprovalPoliciesDTO) =>
    queryOptions({
      queryKey: approvalPolicyQuery.listKey(params),
      queryFn: async () => {
        const { data } = await apiRequest.get<{
          policies: TApprovalPolicy[];
        }>(`/api/v1/approval-policies/${params.policyType}`, {
          params: {
            projectId: params.projectId
          }
        });
        return data.policies;
      }
    })
};
