import { crypto } from "@app/lib/crypto/cryptography";
import { removeTrailingSlash } from "@app/lib/fn";

import {
  DELEGATED_APPROVAL_CALLBACK_PATH,
  DELEGATED_APPROVAL_CALLBACK_TOKEN_BYTES
} from "./delegated-approval-callback-constants";

export const generateDelegatedApprovalCallbackToken = () =>
  crypto.randomBytes(DELEGATED_APPROVAL_CALLBACK_TOKEN_BYTES).toString("base64url");

export const buildDelegatedApprovalCallbackUrl = (siteUrl: string) =>
  `${removeTrailingSlash(siteUrl)}${DELEGATED_APPROVAL_CALLBACK_PATH}`;
