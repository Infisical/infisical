import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { DelegatedApprovalRequestStatus } from "@app/services/delegated-approval/delegated-approval-enums";
import { failDelegatedApprovalRequest } from "@app/services/delegated-approval/delegated-approval-request-fns";
import { KmsDataKey } from "@app/services/kms/kms-types";

import {
  DELEGATED_APPROVAL_CALLBACK_ATTEMPTS_EXHAUSTED_REASON,
  DELEGATED_APPROVAL_CALLBACK_MAX_ATTEMPTS,
  DELEGATED_APPROVAL_CALLBACK_PATH,
  DELEGATED_APPROVAL_CALLBACK_TOKEN_PREFIX,
  DELEGATED_APPROVAL_DECISION_READ_CLAIM_TTL_MS
} from "./delegated-approval-callback-constants";
import {
  buildDelegatedApprovalCallbackEventId,
  TDelegatedApprovalCallbackEventPayload
} from "./delegated-approval-callback-events";
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

  const getOrIssueCallbackToken = async ({ delegatedRequest }: TGetOrIssueCallbackTokenDTO) => {
    const primary = delegatedApprovalRequestDAL.primaryNode();
    const approvalRequest = await approvalRequestDAL.findById(delegatedRequest.requestId, primary);
    if (!approvalRequest) return null;

    const { encryptor, decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: approvalRequest.projectId
    });

    if (delegatedRequest.encryptedCallbackToken) {
      return decryptor({ cipherTextBlob: delegatedRequest.encryptedCallbackToken }).toString();
    }

    const token = generateCallbackToken();
    const encryptedCallbackToken = encryptor({ plainText: Buffer.from(token) }).cipherTextBlob;
    const [issued] = await delegatedApprovalRequestDAL.update(
      { id: delegatedRequest.id, encryptedCallbackToken: null },
      { encryptedCallbackToken }
    );
    if (issued) return token;

    const current = await delegatedApprovalRequestDAL.findById(delegatedRequest.id, primary);
    if (!current?.encryptedCallbackToken) return null;

    return decryptor({ cipherTextBlob: current.encryptedCallbackToken }).toString();
  };

  const handleCallback = async ({ token, event, externalId }: THandleDelegatedApprovalCallbackDTO) => {
    const delegatedRequest = await delegatedApprovalRequestDAL.findByProviderRequestId(externalId);
    if (!delegatedRequest) {
      throw rejectApprovalCallback("no request matches the external ID", { externalId });
    }

    const logContext = { delegatedRequestId: delegatedRequest.id, externalId };

    if (!token || !token.startsWith(DELEGATED_APPROVAL_CALLBACK_TOKEN_PREFIX)) {
      throw rejectApprovalCallback("missing or malformed token", logContext);
    }
    if (!delegatedRequest.encryptedCallbackToken) {
      throw rejectApprovalCallback("request has no callback token", logContext);
    }

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.SecretManager,
      projectId: delegatedRequest.approvalRequestProjectId
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
    // A read-back already in flight will see the decision this callback announces, so a repeat only
    // starts another once that one has had time to finish.
    const outcome = await delegatedApprovalRequestDAL.transaction(async (tx) => {
      await approvalRequestDAL.findByIdForUpdate(delegatedRequest.requestId, tx);
      const claimed = await delegatedApprovalRequestDAL.claimDecisionRead(
        { id: delegatedRequest.id, staleBefore: new Date(Date.now() - DELEGATED_APPROVAL_DECISION_READ_CLAIM_TTL_MS) },
        tx
      );
      if (!claimed) {
        const current = await delegatedApprovalRequestDAL.findById(delegatedRequest.id, tx);
        if (current?.status !== DelegatedApprovalRequestStatus.WaitingApproval) return { status: "closed" } as const;
        return { status: "deduplicated", attempts: current.callbackAttempts } as const;
      }

      const [counted] = await delegatedApprovalRequestDAL.update(
        { id: delegatedRequest.id },
        { $incr: { callbackAttempts: 1 } },
        tx
      );
      const attempts = counted?.callbackAttempts ?? claimed.callbackAttempts + 1;
      if (attempts > DELEGATED_APPROVAL_CALLBACK_MAX_ATTEMPTS) {
        await failDelegatedApprovalRequest(
          {
            id: delegatedRequest.id,
            requestId: delegatedRequest.requestId,
            reason: DELEGATED_APPROVAL_CALLBACK_ATTEMPTS_EXHAUSTED_REASON
          },
          { approvalRequestDAL, delegatedApprovalRequestDAL },
          tx
        );
        return { status: "exhausted", attempts } as const;
      }

      await eventEmitter.emit(
        [
          {
            id: buildDelegatedApprovalCallbackEventId({ delegatedRequestId: delegatedRequest.id, attempts }),
            type: event,
            data: payload
          }
        ],
        tx
      );
      return { status: "accepted", attempts } as const;
    });

    if (outcome.status === "closed") {
      throw rejectApprovalCallback("request is not awaiting a decision", logContext);
    }
    if (outcome.status === "exhausted") {
      throw rejectApprovalCallback("callback attempts exhausted", {
        ...logContext,
        attempts: String(outcome.attempts)
      });
    }

    logger.info(
      `Delegated approval callback ${outcome.status} [delegatedRequestId=${delegatedRequest.id}] [approvalRequestId=${delegatedRequest.requestId}] [event=${event}] [callbackAttempts=${outcome.attempts}]`
    );

    return { delegatedRequestId: delegatedRequest.id };
  };

  return { getCallbackUrl, getOrIssueCallbackToken, handleCallback };
};
