import { QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { signerKeys } from "@app/hooks/api/signers/queries";

import {
  ApprovalPolicyType,
  isCertificateActionPolicyType,
  TCertificateActionPolicyType
} from "../approvalPolicies/types";
import { invalidateCertificate, invalidateDeletedCertificate } from "../certificates/mutations";
import { approvalRequestQuery } from "./queries";
import {
  ApprovalRequestStatus,
  TApprovalRequest,
  TApproveApprovalRequestDTO,
  TCancelApprovalRequestDTO,
  TCertificateActionRequestData,
  TCreateApprovalRequestDTO,
  TRejectApprovalRequestDTO
} from "./types";

const invalidateApprovalRequests = (queryClient: ReturnType<typeof useQueryClient>) => {
  queryClient.invalidateQueries({ queryKey: approvalRequestQuery.allKey() });
  queryClient.invalidateQueries({ queryKey: signerKeys.requestsAll() });
};

const invalidateCertificateOnDecision: Record<
  TCertificateActionPolicyType,
  (queryClient: QueryClient, certificateId: string) => void
> = {
  [ApprovalPolicyType.CertRevocation]: invalidateCertificate,
  [ApprovalPolicyType.CertDeletion]: invalidateDeletedCertificate
};

export const useCreateApprovalRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ policyType, ...dto }: TCreateApprovalRequestDTO) => {
      const { data } = await apiRequest.post<{ request: TApprovalRequest }>(
        `/api/v1/approval-policies/${policyType}/requests`,
        dto
      );
      return data.request;
    },
    onSuccess: () => invalidateApprovalRequests(queryClient)
  });
};

export const useApproveApprovalRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ policyType, requestId, comment }: TApproveApprovalRequestDTO) => {
      const { data } = await apiRequest.post<{ request: TApprovalRequest }>(
        `/api/v1/approval-policies/${policyType}/requests/${requestId}/approve`,
        { comment }
      );
      return data.request;
    },
    onSuccess: (request) => {
      invalidateApprovalRequests(queryClient);
      if (
        isCertificateActionPolicyType(request.type) &&
        request.status !== ApprovalRequestStatus.Pending
      ) {
        invalidateCertificateOnDecision[request.type](
          queryClient,
          (request.requestData.requestData as TCertificateActionRequestData).certificateId
        );
      }
    }
  });
};

export const useRejectApprovalRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ policyType, requestId, comment }: TRejectApprovalRequestDTO) => {
      const { data } = await apiRequest.post<{ request: TApprovalRequest }>(
        `/api/v1/approval-policies/${policyType}/requests/${requestId}/reject`,
        { comment }
      );
      return data.request;
    },
    onSuccess: () => invalidateApprovalRequests(queryClient)
  });
};

export const useCancelApprovalRequest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ policyType, requestId }: TCancelApprovalRequestDTO) => {
      const { data } = await apiRequest.post<{ request: TApprovalRequest }>(
        `/api/v1/approval-policies/${policyType}/requests/${requestId}/cancel`
      );
      return data.request;
    },
    onSuccess: () => invalidateApprovalRequests(queryClient)
  });
};
