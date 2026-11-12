import { queryOptions, useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { ApprovalPolicyScope, ApprovalPolicyType } from "../approvalPolicies/types";
import {
  ApprovalRequestStatus,
  CertRevocationRequestData,
  TApprovalRequest,
  TGetApprovalRequestByIdDTO,
  TListApprovalRequestsDTO
} from "./types";

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
            scope: params.scope,
            id: params.scopeId
          }
        });
        return data.requests;
      }
    })
};

// Maps each certificate in an Application to its revocation request that is still waiting for approval.
export const usePendingCertificateRevocations = (applicationId?: string | null) =>
  useQuery({
    ...approvalRequestQuery.list({
      policyType: ApprovalPolicyType.CertRevocation,
      scope: ApprovalPolicyScope.PkiApplication,
      scopeId: applicationId ?? ""
    }),
    enabled: Boolean(applicationId),
    select: (requests) => {
      const now = Date.now();
      return new Map(
        requests
          .filter(
            (request) =>
              request.status === ApprovalRequestStatus.Pending &&
              (!request.expiresAt || new Date(request.expiresAt).getTime() > now)
          )
          .map((request) => [
            (request.requestData.requestData as CertRevocationRequestData).certificateId,
            request.id
          ])
      );
    }
  });
