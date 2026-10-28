import { TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { TApprovalPolicyDALFactory } from "@app/services/approval-policy/approval-policy-dal";
import { TApprovalResource } from "@app/services/approval-policy/approval-policy-types";
import { TApprovalRequestDALFactory } from "@app/services/approval-policy/approval-request-dal";
import { DelegatedApprovalSupportedPolicyType } from "@app/services/delegated-approval/delegated-approval-maps";
import { TDelegatedApprovalPolicyDALFactory } from "@app/services/delegated-approval/delegated-approval-policy-dal";
import { TDelegatedApprovalRequestDALFactory } from "@app/services/delegated-approval/delegated-approval-request-dal";
import { EventResultStatus } from "@app/services/event-outbox/event-outbox-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";

import { DelegatedApprovalDecision, DelegatedApprovalDecisionOutcome } from "./delegated-approval-decision-enums";

export type TDelegatedApprovalReadDecisionInput = {
  delegatedRequestId: string;
  approvalRequestId: string;
  providerRequestId: string;
};

export type TDelegatedApprovalDecisionReadResult =
  | { status: "pending"; reason: string }
  | {
      status: "decided";
      decision: DelegatedApprovalDecision;
      approvalRequestId: string | null;
      permissions: string[];
      decidedBy: string | null;
      decidedAt: string | null;
      notes: string | null;
    };

export type TDecidedDelegatedApprovalReadResult = Extract<TDelegatedApprovalDecisionReadResult, { status: "decided" }>;

export type TDelegatedApprovalDecisionNotification = {
  approvalRequestId: string;
  decision: DelegatedApprovalDecision;
};

export type TDelegatedApprovalDecisionNotifier = (
  notification: TDelegatedApprovalDecisionNotification
) => Promise<void>;

export type TDelegatedApprovalDecisionAuditMetadata = {
  outcome: DelegatedApprovalDecisionOutcome;
  reason?: string;
  decided?: TDecidedDelegatedApprovalReadResult;
};

export type TDelegatedApprovalDecisionServiceFactoryDep = {
  delegatedApprovalRequestDAL: Pick<
    TDelegatedApprovalRequestDALFactory,
    "findById" | "primaryNode" | "updateWithDetails"
  >;
  delegatedApprovalPolicyDAL: Pick<TDelegatedApprovalPolicyDALFactory, "findOne">;
  approvalPolicyDAL: Pick<TApprovalPolicyDALFactory, "findById">;
  approvalRequestDAL: Pick<TApprovalRequestDALFactory, "findById" | "findByIdForUpdate" | "updateById" | "transaction">;
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  membershipDAL: Pick<TMembershipDALFactory, "isUserProjectMember">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  approvalResources: Record<DelegatedApprovalSupportedPolicyType, Pick<TApprovalResource, "postApprovalTxRoutine">>;
  decisionNotifiers: Record<DelegatedApprovalSupportedPolicyType, TDelegatedApprovalDecisionNotifier>;
};

export type TDelegatedApprovalDecisionContext = {
  delegatedRequestId: string;
  providerRequestId: string;
  providerRecordNumber?: string;
  policyName?: string;
  permissions?: string[];
  approvalRequest: { id: string; organizationId: string; projectId: string; policyId?: string | null };
  delegatedApprovalType: string;
};

export type TApplyDelegatedApprovalDecisionDTO = {
  delegatedRequestId: string;
  externalId: string;
  isFinalAttempt: boolean;
};

export type TApplyDelegatedApprovalDecisionResult = {
  status: EventResultStatus;
  error?: string;
};

export type TDelegatedApprovalFinalizeOutcome =
  | { kind: "applied" }
  | { kind: "late"; reason: string }
  | { kind: "gone" }
  | { kind: "raced" };
