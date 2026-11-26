import { useEffect, useReducer } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { useCertificateActionPolicyProfileNames } from "../approvalPolicies/queries";
import {
  ApprovalPolicyScope,
  ApprovalPolicyType,
  TCertificateActionPolicyType
} from "../approvalPolicies/types";
import { getPendingCertificateActions } from "./pending-certificate-actions";
import { TApprovalRequest, TGetApprovalRequestByIdDTO, TListApprovalRequestsDTO } from "./types";

const MAX_TIMEOUT_MS = 2 ** 31 - 1;

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

export const usePendingCertificateActions = (
  policyType: TCertificateActionPolicyType,
  applicationId?: string | null
) => {
  const [expiryTick, onExpiry] = useReducer((tick: number) => tick + 1, 0);
  const { data } = useQuery({
    ...approvalRequestQuery.list({
      policyType,
      scope: ApprovalPolicyScope.PkiApplication,
      scopeId: applicationId ?? ""
    }),
    enabled: Boolean(applicationId),
    select: (requests) => getPendingCertificateActions(requests, Date.now())
  });

  // A refetch would not drop a lapsed request: the list still returns it unchanged, so the cached
  // data and the select result stay the same. Re-rendering at the expiry re-runs the select instead.
  // The tick re-arms the timer if it fires before the request has lapsed.
  const nextExpiresAt = data?.nextExpiresAt ?? null;
  useEffect(() => {
    if (nextExpiresAt === null) return undefined;
    const remaining = nextExpiresAt - Date.now();
    if (remaining > MAX_TIMEOUT_MS) return undefined;
    const timer = setTimeout(onExpiry, Math.max(remaining, 0));
    return () => clearTimeout(timer);
  }, [nextExpiresAt, expiryTick]);

  return { data: data?.requestByCertificateId };
};

// The certificate list and the certificate page both need, for each action an Application can gate, its pending
// requests and the profiles its policies cover.
export const useCertificateActionApprovalData = (applicationId?: string | null) => {
  const { data: pendingRevocations } = usePendingCertificateActions(
    ApprovalPolicyType.CertRevocation,
    applicationId
  );
  const { data: revocationProfileNames } = useCertificateActionPolicyProfileNames(
    ApprovalPolicyType.CertRevocation,
    applicationId
  );
  const { data: pendingDeletions } = usePendingCertificateActions(
    ApprovalPolicyType.CertDeletion,
    applicationId
  );
  const { data: deletionProfileNames } = useCertificateActionPolicyProfileNames(
    ApprovalPolicyType.CertDeletion,
    applicationId
  );
  const data: Record<
    TCertificateActionPolicyType,
    {
      pending?: ReturnType<typeof usePendingCertificateActions>["data"];
      policyProfileNames?: Set<string>;
    }
  > = {
    [ApprovalPolicyType.CertRevocation]: {
      pending: pendingRevocations,
      policyProfileNames: revocationProfileNames
    },
    [ApprovalPolicyType.CertDeletion]: {
      pending: pendingDeletions,
      policyProfileNames: deletionProfileNames
    }
  };
  return data;
};
