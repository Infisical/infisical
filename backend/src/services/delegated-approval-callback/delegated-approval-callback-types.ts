import { TDelegatedApprovalRequests } from "@app/db/schemas";
import { TKmsCoreDomain } from "@app/domains/platform/kms-core/ce/module";
import { TApprovalRequestDALFactory } from "@app/services/approval-policy/approval-request-dal";
import { TDelegatedApprovalRequestDALFactory } from "@app/services/delegated-approval/delegated-approval-request-dal";
import { TEventEmitter } from "@app/services/event-outbox/event-outbox-types";

import { DelegatedApprovalCallbackEvent } from "./delegated-approval-callback-enums";

export type TDelegatedApprovalCallbackServiceFactoryDep = {
  delegatedApprovalRequestDAL: Pick<
    TDelegatedApprovalRequestDALFactory,
    | "claimDecisionRead"
    | "findById"
    | "findByProviderRequestId"
    | "primaryNode"
    | "transaction"
    | "update"
    | "updateWithDetails"
  >;
  approvalRequestDAL: Pick<TApprovalRequestDALFactory, "findById" | "transaction" | "findByIdForUpdate" | "updateById">;
  kmsCoreDomain: TKmsCoreDomain;
  eventEmitter: Pick<TEventEmitter, "emit">;
};

export type TGetOrIssueCallbackTokenDTO = {
  delegatedRequest: Pick<TDelegatedApprovalRequests, "id" | "requestId" | "encryptedCallbackToken">;
};

export type THandleDelegatedApprovalCallbackDTO = {
  token: string | undefined;
  event: DelegatedApprovalCallbackEvent;
  externalId: string;
};
