import { crypto } from "@app/lib/crypto/cryptography";
import { ForbiddenRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import {
  DELEGATED_APPROVAL_CALLBACK_REJECTED_MESSAGE,
  DELEGATED_APPROVAL_CALLBACK_TOKEN_BYTES,
  DELEGATED_APPROVAL_CALLBACK_TOKEN_PREFIX
} from "./delegated-approval-callback-constants";

export const generateCallbackToken = () =>
  `${DELEGATED_APPROVAL_CALLBACK_TOKEN_PREFIX}${crypto.randomBytes(DELEGATED_APPROVAL_CALLBACK_TOKEN_BYTES).toString("base64url")}`;

export const isTokenMatch = (presented: string, stored: string) => {
  const presentedBytes = Buffer.from(presented);
  const storedBytes = Buffer.from(stored);
  if (presentedBytes.length !== storedBytes.length) return false;
  return crypto.nativeCrypto.timingSafeEqual(presentedBytes, storedBytes);
};

export const rejectApprovalCallback = (reason: string, context: Record<string, string>) => {
  const formatted = Object.entries(context)
    .map(([key, value]) => `[${key}=${value}]`)
    .join(" ");
  logger.warn(`Delegated approval callback rejected: ${reason} ${formatted}`);
  return new ForbiddenRequestError({ message: DELEGATED_APPROVAL_CALLBACK_REJECTED_MESSAGE });
};
