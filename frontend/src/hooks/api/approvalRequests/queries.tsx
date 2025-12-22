import { queryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TApprovalRequest, TGetApprovalRequestByIdDTO, TListApprovalRequestsDTO } from "./types";

export const approvalRequestQuery = {
  allKey: () => ["approval-requests"] as const,
  getByIdKey: (params: TGetApprovalRequestByIdDTO) =>
    [...approvalRequestQuery.allKey(), "by-id", params] as const,
  listKey: (params: TListApprovalRequestsDTO) =>
    [...approvalRequestQuery.allKey(), "list", params] as const,
  getById: (params: TGetApprovalRequestByIdDTO) =>
    queryOptions({
      queryKey: approvalRequestQuery.getByIdKey(params),
      queryFn: async () => {
        const { data } = await apiRequest.get<{ request: TApprovalRequest }>(
          `/api/v1/approval-policies/${params.policyType}/requests/${params.requestId}`
        );
        return data.request;
      }
    }),
  list: (params: TListApprovalRequestsDTO) =>
    queryOptions({
      queryKey: approvalRequestQuery.listKey(params),
      queryFn: async () => {
        const { data } = await apiRequest.get<{
          requests: TApprovalRequest[];
        }>(`/api/v1/approval-policies/${params.policyType}/requests`, {
          params: {
            projectId: params.projectId
          }
        });
        return data.requests;
      }
    })
};
