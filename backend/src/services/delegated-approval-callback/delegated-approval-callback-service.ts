import { getConfig } from "@app/lib/config/env";
import { NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { DelegatedApprovalRequestStatus } from "@app/services/delegated-approval/delegated-approval-enums";
import { failDelegatedApprovalRequest } from "@app/services/delegated-approval/delegated-approval-request-fns";
import { KmsDataKey } from "@app/services/kms/kms-types";

import {
  DELEGATED_APPROVAL_CALLBACK_ATTEMPTS_EXHAUSTED_REASON,
  DELEGATED_APPROVAL_CALLBACK_MAX_ATTEMPTS,
  DELEGATED_APPROVAL_CALLBACK_PATH,
  DELEGATED_APPROVAL_CALLBACK_TOKEN_PREFIX
} from "./delegated-approval-callback-constants";
import { TDelegatedApprovalCallbackEventPayload } from "./delegated-approval-callback-events";
import { generateCallbackToken, isTokenMatch, rejectApprovalCallback } from "./delegated-approval-callback-fns";
import {
  TDelegatedApprovalCallbackServiceFactoryDep,
  TGetOrIssueCallbackTokenDTO,
  THandleDelegatedApprovalCallbackDTO
} from "./delegated-approval-callback-types";

export type TDelegatedApprovalCallbackServiceFactory = ReturnType<typeof delegatedApprovalCallbackServiceFactory>;

export const delegatedApprovalCallbackServiceFactory = ({
  delegatedApprovalRequestDAL,
  approvalRequestDAL,
  kmsService,
  eventEmitter
}: TDelegatedApprovalCallbackServiceFactoryDep) => {
  const getCallbackUrl = () => {
    const { SITE_URL } = getConfig();
    return SITE_URL ? `${SITE_URL}${DELEGATED_APPROVAL_CALLBACK_PATH}` : null;
  };

  const getOrIssueCallbackToken = async ({ delegatedRequest, orgId }: TGetOrIssueCallbackTokenDTO) => {
    const { encryptor, decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId
    });

    if (delegatedRequest.encryptedCallbackToken) {
      return decryptor({ cipherTextBlob: delegatedRequest.encryptedCallbackToken }).toString();
    }

    const token = generateCallbackToken();
    const encryptedCallbackToken = encryptor({ plainText: Buffer.from(token) }).cipherTextBlob;
    const current = await delegatedApprovalRequestDAL.transaction(async (tx) => {
      const [issued] = await delegatedApprovalRequestDAL.update(
        { id: delegatedRequest.id, encryptedCallbackToken: null },
        { encryptedCallbackToken },
        tx
      );
      return issued ?? delegatedApprovalRequestDAL.findById(delegatedRequest.id, tx);
    });
    if (!current?.encryptedCallbackToken) return null;

    return decryptor({ cipherTextBlob: current.encryptedCallbackToken }).toString();
  };

  const handleCallback = async ({ token, event, externalId }: THandleDelegatedApprovalCallbackDTO) => {
    const delegatedRequest = await delegatedApprovalRequestDAL.findByProviderRequestId(externalId);
    if (!delegatedRequest) {
      throw new NotFoundError({
        message: `No delegated approval request matches external ID '${externalId}'`
      });
    }

    const logContext = { delegatedRequestId: delegatedRequest.id, externalId };

    // Counted before the token is checked, so a wrong token for a known external ID still burns the
    // request and the token cannot be brute-forced.
    const [counted] = await delegatedApprovalRequestDAL.update(
      { id: delegatedRequest.id },
      { $incr: { callbackAttempts: 1 } }
    );
    const attempts = counted?.callbackAttempts ?? delegatedRequest.callbackAttempts + 1;
    if (attempts > DELEGATED_APPROVAL_CALLBACK_MAX_ATTEMPTS) {
      await failDelegatedApprovalRequest(
        {
          id: delegatedRequest.id,
          requestId: delegatedRequest.requestId,
          reason: DELEGATED_APPROVAL_CALLBACK_ATTEMPTS_EXHAUSTED_REASON
        },
        { approvalRequestDAL, delegatedApprovalRequestDAL }
      );
      throw rejectApprovalCallback("callback attempts exhausted", {
        ...logContext,
        attempts: String(attempts)
      });
    }

    if (!token || !token.startsWith(DELEGATED_APPROVAL_CALLBACK_TOKEN_PREFIX)) {
      throw rejectApprovalCallback("missing or malformed token", logContext);
    }
    if (!delegatedRequest.encryptedCallbackToken) {
      throw rejectApprovalCallback("request has no callback token", logContext);
    }

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: delegatedRequest.approvalRequestOrganizationId
    });
    const storedToken = decryptor({ cipherTextBlob: delegatedRequest.encryptedCallbackToken }).toString();
    if (!isTokenMatch(token, storedToken)) {
      throw rejectApprovalCallback("token mismatch", logContext);
    }

    if (delegatedRequest.status !== DelegatedApprovalRequestStatus.WaitingApproval) {
      throw rejectApprovalCallback("request is not awaiting a decision", {
        ...logContext,
        status: delegatedRequest.status
      });
    }

    const payload: TDelegatedApprovalCallbackEventPayload = {
      delegatedRequestId: delegatedRequest.id,
      approvalRequestId: delegatedRequest.requestId,
      orgId: delegatedRequest.approvalRequestOrganizationId,
      event,
      externalId
    };
    await eventEmitter.emit({ eventType: event, idempotencyKey: `${delegatedRequest.id}:${attempts}`, payload });

    logger.info(
      `Delegated approval callback accepted [delegatedRequestId=${delegatedRequest.id}] [approvalRequestId=${delegatedRequest.requestId}] [event=${event}] [attempt=${attempts}]`
    );

    return { delegatedRequestId: delegatedRequest.id };
  };

  return { getCallbackUrl, getOrIssueCallbackToken, handleCallback };
};
