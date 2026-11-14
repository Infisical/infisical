import { queryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TApprovalPolicy,
  TAutoApprovalCatalog,
  TAutoApprovalOption,
  TGetApprovalPolicyByIdDTO,
  TGetAutoApprovalCatalogDTO,
  TListApprovalPoliciesDTO,
  TListAutoApprovalOptionsDTO
} from "./types";

export const approvalPolicyQuery = {
  allKey: () => ["approval-policies"] as const,
  getByIdKey: (params: TGetApprovalPolicyByIdDTO) =>
    [...approvalPolicyQuery.allKey(), "by-id", params] as const,
  listKey: (params: TListApprovalPoliciesDTO) =>
    [...approvalPolicyQuery.allKey(), "list", params] as const,
  autoApprovalCatalogKey: (params: TGetAutoApprovalCatalogDTO) =>
    [...approvalPolicyQuery.allKey(), "auto-approval-catalog", params] as const,
  autoApprovalOptionsKey: (params: TListAutoApprovalOptionsDTO) =>
    [...approvalPolicyQuery.allKey(), "auto-approval-options", params] as const,
  autoApprovalCatalog: (params: TGetAutoApprovalCatalogDTO) =>
    queryOptions({
      queryKey: approvalPolicyQuery.autoApprovalCatalogKey(params),
      queryFn: async () => {
        const { data } = await apiRequest.get<TAutoApprovalCatalog>(
          `/api/v1/approval-policies/${params.policyType}/auto-approval/catalog`,
          { params: { scope: params.scope, id: params.scopeId } }
        );
        return data;
      }
    }),
  autoApprovalOptions: (params: TListAutoApprovalOptionsDTO) =>
    queryOptions({
      queryKey: approvalPolicyQuery.autoApprovalOptionsKey(params),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ options: TAutoApprovalOption[] }>(
          `/api/v1/approval-policies/${params.policyType}/auto-approval/options`,
          {
            params: {
              scope: params.scope,
              id: params.scopeId,
              connectionId: params.connectionId,
              subject: params.subject,
              constraint: params.constraint,
              search: params.search || undefined,
              siblings:
                params.siblings && Object.keys(params.siblings).length
                  ? JSON.stringify(params.siblings)
                  : undefined
            }
          }
        );
        return data.options;
      }
    }),
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
            scope: params.scope,
            id: params.scopeId
          }
        });
        return data.policies;
      }
    })
};
