import { crypto } from "@app/lib/crypto/cryptography";
import { ForbiddenRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ApprovalRequestStatus } from "@app/services/approval-policy/approval-policy-enums";
import { DelegatedApprovalRequestStatus } from "@app/services/delegated-approval/delegated-approval-enums";
import { DELEGATED_APPROVAL_STATUS_REASON_MAX_CHARS } from "@app/services/delegated-approval/dispatch/delegated-approval-dispatch-constants";

import {
  DELEGATED_APPROVAL_CALLBACK_ATTEMPTS_EXHAUSTED_REASON,
  DELEGATED_APPROVAL_CALLBACK_REJECTED_MESSAGE,
  DELEGATED_APPROVAL_CALLBACK_TOKEN_BYTES,
  DELEGATED_APPROVAL_CALLBACK_TOKEN_PREFIX
} from "./delegated-approval-callback-constants";
import { TFailExhaustedDelegatedApprovalRequestDTO } from "./delegated-approval-callback-types";

export const generateDelegatedApprovalCallbackToken = () =>
  `${DELEGATED_APPROVAL_CALLBACK_TOKEN_PREFIX}${crypto.randomBytes(DELEGATED_APPROVAL_CALLBACK_TOKEN_BYTES).toString("base64url")}`;

export const isDelegatedApprovalCallbackTokenMatch = (presented: string, stored: string) => {
  const presentedBytes = Buffer.from(presented);
  const storedBytes = Buffer.from(stored);
  if (presentedBytes.length !== storedBytes.length) return false;
  return crypto.nativeCrypto.timingSafeEqual(presentedBytes, storedBytes);
};

export const rejectDelegatedApprovalCallback = (reason: string, context: Record<string, string>) => {
  const formatted = Object.entries(context)
    .map(([key, value]) => `[${key}=${value}]`)
    .join(" ");
  logger.warn(`Delegated approval callback rejected: ${reason} ${formatted}`);
  return new ForbiddenRequestError({ message: DELEGATED_APPROVAL_CALLBACK_REJECTED_MESSAGE });
};

export const failExhaustedDelegatedApprovalRequest = ({
  id,
  requestId,
  approvalRequestDAL,
  delegatedApprovalRequestDAL
}: TFailExhaustedDelegatedApprovalRequestDTO) =>
  approvalRequestDAL.transaction(async (tx) => {
    const approvalRequest = await approvalRequestDAL.findByIdForUpdate(requestId, tx);
    if (approvalRequest?.status === ApprovalRequestStatus.Pending) {
      await approvalRequestDAL.updateById(requestId, { status: ApprovalRequestStatus.Cancelled }, tx);
    }
    await delegatedApprovalRequestDAL.update(
      { id, status: DelegatedApprovalRequestStatus.WaitingApproval },
      {
        status: DelegatedApprovalRequestStatus.Failed,
        statusReason: DELEGATED_APPROVAL_CALLBACK_ATTEMPTS_EXHAUSTED_REASON.slice(
          0,
          DELEGATED_APPROVAL_STATUS_REASON_MAX_CHARS
        )
      },
      tx
    );
  });
