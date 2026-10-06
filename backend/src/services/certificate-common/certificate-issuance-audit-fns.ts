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

const MAX_ERROR_MESSAGE_LENGTH = 1000;

type TCertificateIssuanceFailedMetadata = Omit<
  Extract<Event, { type: EventType.CERTIFICATE_ISSUANCE_FAILED }>["metadata"],
  "errorName" | "error" | keyof TAuditLogCollapseSummary
>;

export type TRecordCertificateIssuanceFailureDTO = {
  auditLogInfo: AuditLogInfo;
  projectId: string;
  error: unknown;
  metadata: TCertificateIssuanceFailedMetadata;
};

// Never throws, so callers can rethrow the original error untouched.
export const recordCertificateIssuanceFailure = async (
  auditLogService: Pick<TAuditLogServiceFactory, "createCollapsedAuditLog">,
  { auditLogInfo, projectId, error, metadata }: TRecordCertificateIssuanceFailureDTO
) => {
  // An access refusal is not an issuance failure; CASL denials get their own permission-denied event.
  if (error instanceof ForbiddenError || error instanceof ForbiddenRequestError) return;

  const errorName = error instanceof Error ? error.name : "UnknownError";
  const errorMessage = (error instanceof Error ? error.message : String(error)).slice(0, MAX_ERROR_MESSAGE_LENGTH);

  const actorIdKey = ACTOR_TYPE_TO_METADATA_ID_KEY[auditLogInfo.actor.type];
  const actorId = actorIdKey ? (auditLogInfo.actor.metadata as Record<string, unknown>)[actorIdKey] : undefined;

  try {
    await auditLogService.createCollapsedAuditLog({
      ...auditLogInfo,
      projectId,
      event: {
        type: EventType.CERTIFICATE_ISSUANCE_FAILED,
        metadata: { ...metadata, errorName, error: errorMessage }
      },
      collapseKeyParts: [
        projectId,
        auditLogInfo.actor.type,
        actorId ?? null,
        metadata.operation,
        metadata.certificateProfileId ?? null,
        metadata.certificateRequestId ?? null,
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
