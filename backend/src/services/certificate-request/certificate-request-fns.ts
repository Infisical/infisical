import { Knex } from "knex";

import { TCertificateRequests } from "@app/db/schemas";
import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { InternalServerError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TPkiApplicationDALFactory } from "@app/services/pki-application/pki-application-dal";

import { TApprovalPolicyDALFactory } from "../approval-policy/approval-policy-dal";
import { ApprovalRequestStatus } from "../approval-policy/approval-policy-enums";
import { TApprovalPolicyServiceFactory } from "../approval-policy/approval-policy-service";
import { TApprovalRequestDALFactory } from "../approval-policy/approval-request-dal";
import { getApprovalRequestAuditLabel } from "../approval-policy/approval-request-fns";
import { TCertRequestRequestData } from "../approval-policy/cert-request/cert-request-policy-types";
import { ActorType } from "../auth/auth-type";
import { TCertificateAuthorityDALFactory } from "../certificate-authority/certificate-authority-dal";
import { CaType } from "../certificate-authority/certificate-authority-enums";
import { caUsesExternalIssuanceQueue } from "../certificate-authority/certificate-authority-maps";
import { CertificateIssuanceOperation } from "../certificate-common/certificate-constants";
import { extractCertificateRequestFromCSR } from "../certificate-common/certificate-csr-utils";
import { describeCaOperationFailure } from "../certificate-common/certificate-failure-fns";
import {
  recordCertificateIssuanceFailure,
  TRecordCertificateIssuanceFailureDeps
} from "../certificate-common/certificate-issuance-audit-fns";
import { TCertificateProfileDALFactory } from "../certificate-profile/certificate-profile-dal";
import { EnrollmentType } from "../certificate-profile/certificate-profile-types";
import { TCertificateRequestDALFactory } from "./certificate-request-dal";
import { CertificateRequestStatus } from "./certificate-request-types";

type TCertificateRequestBookkeepingDAL = Pick<
  TCertificateRequestDALFactory,
  "attachCertificate" | "transitionFromPending"
>;

export const attachCertificateToPendingRequest = async (
  certificateRequestDAL: TCertificateRequestBookkeepingDAL,
  {
    certificateRequestId,
    certificateId,
    projectId,
    operation
  }: {
    certificateRequestId: string;
    certificateId: string;
    projectId: string;
    operation: CertificateIssuanceOperation;
  },
  tx: Knex
) => {
  const attachedRequest = await certificateRequestDAL.attachCertificate(certificateRequestId, certificateId, tx);
  if (!attachedRequest) {
    logger.error(
      { certificateRequestId, projectId, operation },
      `Certificate request left a pending status mid-operation, aborting [certificateRequestId=${certificateRequestId}]`
    );
    throw new InternalServerError({
      message: "Certificate request is no longer pending, so the operation was aborted"
    });
  }
};

export const markPendingRequestFailed = async (
  certificateRequestDAL: TCertificateRequestBookkeepingDAL,
  {
    certificateRequestId,
    error,
    fallbackMessage
  }: { certificateRequestId: string; error: unknown; fallbackMessage: string }
) => {
  try {
    await certificateRequestDAL.transitionFromPending(
      certificateRequestId,
      CertificateRequestStatus.FAILED,
      error instanceof Error ? error.message : fallbackMessage
    );
  } catch (bookkeepingErr) {
    logger.error(
      bookkeepingErr,
      `Failed to mark certificate request as failed [certificateRequestId=${certificateRequestId}]`
    );
  }
};

type TApprovalLookupDeps = {
  approvalRequestDAL: Pick<TApprovalRequestDALFactory, "findById">;
  approvalPolicyDAL: Pick<TApprovalPolicyDALFactory, "findById">;
};

export type TRecordCertificateRequestFailureDeps = Omit<
  TRecordCertificateIssuanceFailureDeps,
  "certificateAuthorityDAL"
> &
  TApprovalLookupDeps & {
    certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById" | "findByIdWithAssociatedCa">;
    certificateProfileDAL: Pick<TCertificateProfileDALFactory, "findById">;
    approvalPolicyService: Pick<TApprovalPolicyServiceFactory, "notifyApprovedActionFailed">;
  };

const $findApprovalRequest = async (deps: TApprovalLookupDeps, approvalRequestId?: string | null) => {
  if (!approvalRequestId) return undefined;
  const approvalRequest = await deps.approvalRequestDAL.findById(approvalRequestId);
  if (!approvalRequest) return undefined;
  const policy = approvalRequest.policyId ? await deps.approvalPolicyDAL.findById(approvalRequest.policyId) : undefined;
  const { requestData } = (approvalRequest.requestData as { requestData?: TCertRequestRequestData } | null) ?? {};
  return { approvalRequest, policy, renewal: requestData?.renewal };
};

const $warnLookupFailed = (certificateRequestId: string) => (err: unknown) => {
  logger.warn(
    err,
    `Failed to look up a failed certificate request's details [certificateRequestId=${certificateRequestId}]`
  );
  return undefined;
};

// Records a certificate-issuance-failed event for a request that failed outside the request that
// created it (a background job or an approval), so the actor is the platform. With `notifyApprovers`, a
// request that was approved also tells its requester and approvers, using the reason the job stored on the
// request. The approval routine passes it unset because it notifies with the error it caught. Never throws.
export const recordCertificateRequestFailure = async (
  deps: TRecordCertificateRequestFailureDeps,
  {
    certificateRequest,
    operation,
    originalCertificateId,
    error,
    notifyApprovers = false
  }: {
    certificateRequest: TCertificateRequests;
    operation?: CertificateIssuanceOperation;
    originalCertificateId?: string;
    error?: unknown;
    notifyApprovers?: boolean;
  }
) => {
  const onLookupError = $warnLookupFailed(certificateRequest.id);
  const [profile, approval] = await Promise.all([
    certificateRequest.profileId
      ? deps.certificateProfileDAL.findById(certificateRequest.profileId).catch(onLookupError)
      : undefined,
    $findApprovalRequest(deps, certificateRequest.approvalRequestId).catch(onLookupError)
  ]);
  const ca =
    certificateRequest.caId && (!operation || (notifyApprovers && approval))
      ? await deps.certificateAuthorityDAL.findByIdWithAssociatedCa(certificateRequest.caId).catch(onLookupError)
      : undefined;

  let resolvedOperation = operation;
  if (!resolvedOperation) {
    if (ca?.externalCa?.type && caUsesExternalIssuanceQueue(ca.externalCa.type as CaType)) {
      resolvedOperation = CertificateIssuanceOperation.ORDER;
    } else {
      resolvedOperation = certificateRequest.csr
        ? CertificateIssuanceOperation.SIGN
        : CertificateIssuanceOperation.ISSUE;
    }
  }

  let commonName = certificateRequest.commonName || undefined;
  if (!commonName && certificateRequest.csr) {
    try {
      commonName = extractCertificateRequestFromCSR(certificateRequest.csr).commonName || undefined;
    } catch {
      commonName = undefined;
    }
  }

  await recordCertificateIssuanceFailure(deps, {
    auditLogInfo: { actor: { type: ActorType.PLATFORM, metadata: {} } },
    projectId: certificateRequest.projectId,
    error: error ?? new Error(certificateRequest.errorMessage || "Certificate issuance failed"),
    metadata: {
      operation: resolvedOperation,
      enrollmentType: certificateRequest.enrollmentType as EnrollmentType | null,
      certificateRequestId: certificateRequest.id,
      certificateProfileId: certificateRequest.profileId,
      profileName: profile?.slug,
      caId: certificateRequest.caId,
      commonName,
      originalCertificateId,
      applicationId: certificateRequest.applicationId,
      ...(approval && getApprovalRequestAuditLabel(approval.approvalRequest, approval.policy))
    }
  });

  if (!notifyApprovers || approval?.approvalRequest.status !== ApprovalRequestStatus.Approved) return;
  await deps.approvalPolicyService.notifyApprovedActionFailed(
    approval.approvalRequest,
    describeCaOperationFailure({
      action: approval.renewal ? "Renewing the certificate" : "Issuing the certificate",
      ca,
      message: certificateRequest.errorMessage,
      fallback: "An unexpected error stopped the certificate from being issued."
    })
  );
};

export type TRecordApprovedRenewalIssuedDeps = TApprovalLookupDeps & {
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  certificateDAL: Pick<TCertificateDALFactory, "findById">;
  certificateProfileDAL: Pick<TCertificateProfileDALFactory, "findById">;
  pkiApplicationDAL: Pick<TPkiApplicationDALFactory, "findById">;
};

// An external CA finishes an approved renewal in a background job, after the approval already recorded a
// renew-certificate event that couldn't name the new certificate yet. This records the one the CA issued,
// linked to the approval request. Never throws, since the certificate is already attached.
export const recordApprovedRenewalIssued = async (
  deps: TRecordApprovedRenewalIssuedDeps,
  { certificateRequest, certificateId }: { certificateRequest: TCertificateRequests; certificateId: string }
) => {
  try {
    const approval = await $findApprovalRequest(deps, certificateRequest.approvalRequestId);
    if (!approval?.renewal) return;

    const [certificate, profile, application] = await Promise.all([
      deps.certificateDAL.findById(certificateId),
      certificateRequest.profileId ? deps.certificateProfileDAL.findById(certificateRequest.profileId) : undefined,
      certificateRequest.applicationId ? deps.pkiApplicationDAL.findById(certificateRequest.applicationId) : undefined
    ]);
    await deps.auditLogService.createAuditLog({
      projectId: certificateRequest.projectId,
      actor: { type: ActorType.PLATFORM, metadata: {} },
      event: {
        type: EventType.RENEW_CERTIFICATE,
        metadata: {
          originalCertificateId: approval.renewal.certificateId,
          newCertificateId: certificateId,
          serialNumber: certificate?.serialNumber,
          certificateRequestId: certificateRequest.id,
          profileName: profile?.slug ?? "",
          commonName: certificateRequest.commonName || certificate?.commonName || "",
          applicationId: certificateRequest.applicationId,
          applicationName: application?.name,
          renewalKeySource: approval.renewal.renewalKeySource,
          externalConfiguration: approval.renewal.externalConfiguration,
          status: CertificateRequestStatus.ISSUED,
          ...getApprovalRequestAuditLabel(approval.approvalRequest, approval.policy)
        }
      }
    });
  } catch (error) {
    logger.error(
      error,
      `Failed to record an approved renewal the CA issued [certificateRequestId=${certificateRequest.id}] [certificateId=${certificateId}]`
    );
  }
};
