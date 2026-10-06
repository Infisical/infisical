import { Knex } from "knex";

import { TCertificateRequests } from "@app/db/schemas";
import { InternalServerError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { ActorType } from "../auth/auth-type";
import { TCertificateAuthorityDALFactory } from "../certificate-authority/certificate-authority-dal";
import { CaType } from "../certificate-authority/certificate-authority-enums";
import { caUsesExternalIssuanceQueue } from "../certificate-authority/certificate-authority-maps";
import { CertificateIssuanceOperation } from "../certificate-common/certificate-constants";
import { extractCertificateRequestFromCSR } from "../certificate-common/certificate-csr-utils";
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

export type TRecordCertificateRequestFailureDeps = Omit<
  TRecordCertificateIssuanceFailureDeps,
  "certificateAuthorityDAL"
> & {
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findById" | "findByIdWithAssociatedCa">;
  certificateProfileDAL: Pick<TCertificateProfileDALFactory, "findById">;
};

const $resolveRequestOperation = async (
  certificateAuthorityDAL: TRecordCertificateRequestFailureDeps["certificateAuthorityDAL"],
  certificateRequest: TCertificateRequests
) => {
  const ca = certificateRequest.caId
    ? await certificateAuthorityDAL.findByIdWithAssociatedCa(certificateRequest.caId).catch(() => undefined)
    : undefined;
  if (ca?.externalCa?.type && caUsesExternalIssuanceQueue(ca.externalCa.type as CaType)) {
    return CertificateIssuanceOperation.ORDER;
  }
  return certificateRequest.csr ? CertificateIssuanceOperation.SIGN : CertificateIssuanceOperation.ISSUE;
};

// Records a certificate-issuance-failed event for a request that failed outside the request that
// created it (a background job or an approval), so the actor is the platform. Never throws.
export const recordCertificateRequestFailure = async (
  deps: TRecordCertificateRequestFailureDeps,
  {
    certificateRequest,
    operation,
    originalCertificateId,
    error
  }: {
    certificateRequest: TCertificateRequests;
    operation?: CertificateIssuanceOperation;
    originalCertificateId?: string;
    error?: unknown;
  }
) => {
  try {
    const [profile, resolvedOperation] = await Promise.all([
      certificateRequest.profileId ? deps.certificateProfileDAL.findById(certificateRequest.profileId) : undefined,
      operation ?? $resolveRequestOperation(deps.certificateAuthorityDAL, certificateRequest)
    ]);

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
        ...(certificateRequest.enrollmentType && {
          enrollmentType: certificateRequest.enrollmentType as EnrollmentType
        }),
        certificateRequestId: certificateRequest.id,
        ...(certificateRequest.profileId && { certificateProfileId: certificateRequest.profileId }),
        ...(profile && { profileName: profile.slug }),
        ...(certificateRequest.caId && { caId: certificateRequest.caId }),
        ...(commonName && { commonName }),
        ...(originalCertificateId && { originalCertificateId }),
        ...(certificateRequest.applicationId && { applicationId: certificateRequest.applicationId })
      }
    });
  } catch (auditError) {
    logger.warn(
      auditError,
      `Failed to record certificate issuance failure [certificateRequestId=${certificateRequest.id}]`
    );
  }
};
