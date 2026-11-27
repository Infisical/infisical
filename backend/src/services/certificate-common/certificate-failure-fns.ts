import { BadRequestError, DatabaseError, InternalServerError, NotFoundError } from "@app/lib/errors";
import { asSentence } from "@app/lib/fn/string";
import { CaType } from "@app/services/certificate-authority/certificate-authority-enums";

import { CaOperationFailureStage } from "./certificate-constants";
import { CA_TYPE_LABEL } from "./external-metadata-schemas";

// The CA is named only when the failure happened there, since a notice that blames the CA for Infisical's own
// check or database error sends people to the wrong place, and one saying the CA failed after it issued the
// certificate invites a retry that issues a duplicate. At the CA, the upstream text is quoted (it is already
// stored on the request) and `message`, a job's stored reason, stands in when there is no error. Infisical's own
// errors carry text a user can act on only when they are request errors.
export const formatCaLabel = (ca: { name: string; externalCa?: { type?: string | null } | null }) => {
  const caType = ca.externalCa?.type as CaType | undefined;
  return caType ? `CA '${ca.name}' (${CA_TYPE_LABEL[caType] ?? caType})` : `CA '${ca.name}'`;
};

export const describeCaOperationFailure = ({
  action,
  stage,
  ca,
  error,
  message: storedMessage,
  fallback
}: {
  action: string;
  stage: CaOperationFailureStage;
  ca?: { name: string; externalCa?: { type?: string | null } | null } | null;
  error?: unknown;
  message?: string | null;
  fallback: string;
}) => {
  const caLabel = ca ? formatCaLabel(ca) : undefined;

  if (stage === CaOperationFailureStage.AttachingIssuedCertificate) {
    return `${caLabel ?? "The CA"} issued the certificate, but Infisical couldn't link it to this request. Find it in the certificate inventory before you renew or request it again.`;
  }

  const requestErrorMessage =
    error instanceof BadRequestError || error instanceof NotFoundError ? error.message : undefined;
  if (
    stage === CaOperationFailureStage.Infisical ||
    error instanceof DatabaseError ||
    error instanceof InternalServerError
  ) {
    return requestErrorMessage ? asSentence(requestErrorMessage) : fallback;
  }

  const caMessage = (error instanceof Error ? error.message : undefined) || storedMessage;
  if (!caLabel) return caMessage ? asSentence(caMessage) : fallback;
  return caMessage
    ? `${action} at ${caLabel} failed: ${asSentence(caMessage)}`
    : `${action} at ${caLabel} failed with an unexpected error.`;
};
