import { queryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TApprovalGrant, TGetApprovalGrantByIdDTO, TListApprovalGrantsDTO } from "./types";

export const approvalGrantQuery = {
  allKey: () => ["approval-grants"] as const,
  getByIdKey: (params: TGetApprovalGrantByIdDTO) =>
    [...approvalGrantQuery.allKey(), "by-id", params] as const,
  listKey: (params: TListApprovalGrantsDTO) =>
    [...approvalGrantQuery.allKey(), "list", params] as const,
  getById: (params: TGetApprovalGrantByIdDTO) =>
    queryOptions({
      queryKey: approvalGrantQuery.getByIdKey(params),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ grant: TApprovalGrant }>(
          `/api/v1/approval-policies/${params.policyType}/grants/${params.grantId}`
        );
        return data.grant;
      }
    }),
  list: (params: TListApprovalGrantsDTO) =>
    queryOptions({
      queryKey: approvalGrantQuery.listKey(params),
      queryFn: async () => {
        const { data } = await apiRequest.get<{
          grants: TApprovalGrant[];
        }>(`/api/v1/approval-policies/${params.policyType}/grants`, {
          params: {
            projectId: params.projectId
          }
        });
        return data.grants;
      }
    })
};
