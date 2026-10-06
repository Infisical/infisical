import { ForbiddenError } from "@casl/ability";

import {
  ACTOR_TYPE_TO_METADATA_ID_KEY,
  AuditLogInfo,
  Event,
  EventType,
  TAuditLogCollapseSummary,
  TAuditLogServiceFactory
} from "@app/ee/services/audit-log/audit-log-types";
import { ForbiddenRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";
import { TPkiApplicationDALFactory } from "@app/services/pki-application/pki-application-dal";

const MAX_ERROR_MESSAGE_LENGTH = 1000;

type TCertificateIssuanceFailedMetadata = Omit<
  Extract<Event, { type: EventType.CERTIFICATE_ISSUANCE_FAILED }>["metadata"],
  "errorName" | "error" | keyof TAuditLogCollapseSummary
>;

export type TRecordCertificateIssuanceFailureDeps = {
  auditLogService: Pick<TAuditLogServiceFactory, "createCollapsedAuditLog">;
  certificateAuthorityDAL?: Pick<TCertificateAuthorityDALFactory, "findById">;
  pkiApplicationDAL?: Pick<TPkiApplicationDALFactory, "findById">;
};

export type TRecordCertificateIssuanceFailureDTO = {
  auditLogInfo: AuditLogInfo;
  projectId: string;
  error: unknown;
  metadata: TCertificateIssuanceFailedMetadata;
};

// Lets the code that created a certificate request attach its id to the error it rethrows, so the
// recorder further up can link the event to that request.
const certificateRequestIdByError = new WeakMap<object, string>();

export const tagErrorWithCertificateRequest = (error: unknown, certificateRequestId: string) => {
  if (error && typeof error === "object") certificateRequestIdByError.set(error, certificateRequestId);
};

const getTaggedCertificateRequestId = (error: unknown) =>
  error && typeof error === "object" ? certificateRequestIdByError.get(error) : undefined;

// Never throws, so callers can rethrow the original error untouched.
export const recordCertificateIssuanceFailure = async (
  { auditLogService, certificateAuthorityDAL, pkiApplicationDAL }: TRecordCertificateIssuanceFailureDeps,
  { auditLogInfo, projectId, error, metadata }: TRecordCertificateIssuanceFailureDTO
) => {
  // An access refusal is not an issuance failure; CASL denials get their own permission-denied event.
  if (error instanceof ForbiddenError || error instanceof ForbiddenRequestError) return;

  const errorName = error instanceof Error ? error.name : "UnknownError";
  const errorMessage = (error instanceof Error ? error.message : String(error)).slice(0, MAX_ERROR_MESSAGE_LENGTH);

  const actorIdKey = ACTOR_TYPE_TO_METADATA_ID_KEY[auditLogInfo.actor.type];
  const actorId = actorIdKey ? (auditLogInfo.actor.metadata as Record<string, unknown>)[actorIdKey] : undefined;

  try {
    const certificateRequestId = metadata.certificateRequestId ?? getTaggedCertificateRequestId(error);
    const [ca, application] = await Promise.all([
      metadata.caId && !metadata.caName ? certificateAuthorityDAL?.findById(metadata.caId) : undefined,
      metadata.applicationId && !metadata.applicationName
        ? pkiApplicationDAL?.findById(metadata.applicationId)
        : undefined
    ]);

    await auditLogService.createCollapsedAuditLog({
      ...auditLogInfo,
      projectId,
      event: {
        type: EventType.CERTIFICATE_ISSUANCE_FAILED,
        metadata: {
          ...metadata,
          ...(certificateRequestId && { certificateRequestId }),
          ...(ca?.name && { caName: ca.name }),
          ...(application?.name && { applicationName: application.name }),
          errorName,
          error: errorMessage
        }
      },
      collapseKeyParts: [
        projectId,
        auditLogInfo.actor.type,
        actorId ?? null,
        metadata.operation,
        metadata.certificateProfileId ?? null,
        metadata.applicationId ?? null,
        metadata.commonName ?? null,
        metadata.originalCertificateId ?? null,
        certificateRequestId ?? null,
        errorName,
        errorMessage
      ]
    });
  } catch (auditError) {
    logger.warn(
      auditError,
      `Failed to record certificate issuance failure [projectId=${projectId}] [operation=${metadata.operation}]`
    );
  }
};
