import { crypto } from "@app/lib/crypto/cryptography";

import { DELEGATED_APPROVAL_CALLBACK_TOKEN_BYTES } from "./delegated-approval-callback-constants";

export const generateDelegatedApprovalCallbackToken = () =>
  crypto.randomBytes(DELEGATED_APPROVAL_CALLBACK_TOKEN_BYTES).toString("base64url");
