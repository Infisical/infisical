import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { asSentence } from "@app/lib/fn/string";
import { CaType } from "@app/services/certificate-authority/certificate-authority-enums";

import { CA_TYPE_LABEL } from "./external-metadata-schemas";

// Only request errors carry text a user can act on; anything else is reported as unexpected rather than leaking
// internal detail. `message` is for text already written for users (a background job's stored reason), and is used
// instead. The CA is named so a generic upstream message ("Unable to connect to gateway") says where it failed.
export const describeCaOperationFailure = ({
  action,
  ca,
  error,
  message: shownMessage,
  fallback
}: {
  action: string;
  ca?: { name: string; externalCa?: { type?: string | null } | null } | null;
  error?: unknown;
  message?: string | null;
  fallback: string;
}) => {
  const message =
    shownMessage || (error instanceof BadRequestError || error instanceof NotFoundError ? error.message : undefined);
  if (!ca) return message ? asSentence(message) : fallback;

  const caType = ca.externalCa?.type as CaType | undefined;
  const caLabel = caType ? `CA '${ca.name}' (${CA_TYPE_LABEL[caType] ?? caType})` : `CA '${ca.name}'`;
  return message
    ? `${action} at ${caLabel} failed: ${asSentence(message)}`
    : `${action} at ${caLabel} failed with an unexpected error.`;
};
