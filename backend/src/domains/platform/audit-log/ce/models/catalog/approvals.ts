import { ActorType } from "@app/lib/auth/actor-types";

import { EventType, SecretApprovalEvent } from "../event-type";
import type { TAuditLogApprovalStatus, TAutoApprovalAuditMetadata } from "./shared";

export interface SecretApprovalMerge {
  type: EventType.SECRET_APPROVAL_MERGED;
  metadata: {
    mergedBy: string;
    secretApprovalRequestSlug: string;
    secretApprovalRequestId: string;
    isMergedViaBypass?: boolean;
    bypassReason?: string;
  };
}

export interface SecretApprovalClosed {
  type: EventType.SECRET_APPROVAL_CLOSED;
  metadata: {
    closedBy: string;
    secretApprovalRequestSlug: string;
    secretApprovalRequestId: string;
  };
}

export interface SecretApprovalReopened {
  type: EventType.SECRET_APPROVAL_REOPENED;
  metadata: {
    reopenedBy: string;
    secretApprovalRequestSlug: string;
    secretApprovalRequestId: string;
  };
}

export interface SecretApprovalRequest {
  type: EventType.SECRET_APPROVAL_REQUEST;
  metadata: {
    committedBy?: string | null;
    secretApprovalRequestSlug: string;
    secretApprovalRequestId: string;
    eventType: SecretApprovalEvent;
    secretKey?: string;
    secretId?: string;
    secrets?: {
      secretKey?: string;
      secretId?: string;
      environment?: string;
      secretPath?: string;
    }[];
    environment: string;
    secretPath: string;
  };
}

export interface SecretApprovalRequestReview {
  type: EventType.SECRET_APPROVAL_REQUEST_REVIEW;
  metadata: {
    secretApprovalRequestId: string;
    reviewedBy: string;
    status: TAuditLogApprovalStatus;
    comment: string;
  };
}

export interface ProjectAccessRequestEvent {
  type: EventType.PROJECT_ACCESS_REQUEST;
  metadata: {
    projectId: string;
    requesterId: string;
    requesterEmail: string;
  };
}

export interface ProjectAssumePrivilegesEvent {
  type: EventType.PROJECT_ASSUME_PRIVILEGE_SESSION_START;
  metadata: {
    projectId: string;
    requesterId: string;
    requesterEmail: string;
    targetActorType: ActorType;
    targetActorId: string;
    duration: string;
  };
}

export interface ProjectAssumePrivilegesExitEvent {
  type: EventType.PROJECT_ASSUME_PRIVILEGE_SESSION_END;
  metadata: {
    projectId: string;
    requesterId: string;
    requesterEmail: string;
    targetActorType: ActorType;
    targetActorId: string;
  };
}

export interface ApprovalPolicyCreateEvent {
  type: EventType.APPROVAL_POLICY_CREATE;
  metadata: {
    policyType: string;
    name: string;
  };
}

export interface ApprovalPolicyUpdateEvent {
  type: EventType.APPROVAL_POLICY_UPDATE;
  metadata: {
    policyType: string;
    policyId: string;
    name: string;
  };
}

export interface ApprovalPolicyDeleteEvent {
  type: EventType.APPROVAL_POLICY_DELETE;
  metadata: {
    policyType: string;
    policyId: string;
  };
}

export interface ApprovalPolicyListEvent {
  type: EventType.APPROVAL_POLICY_LIST;
  metadata: {
    policyType: string;
    count: number;
  };
}

export interface ApprovalPolicyGetEvent {
  type: EventType.APPROVAL_POLICY_GET;
  metadata: {
    policyType: string;
    policyId: string;
    name: string;
  };
}

export interface ApprovalRequestGetEvent {
  type: EventType.APPROVAL_REQUEST_GET;
  metadata: {
    policyType: string;
    approvalRequestId: string;
    requesterName: string;
    requesterEmail: string;
    status: string;
  } & TAuditLogApprovalRequestSubject;
}

export interface ApprovalRequestListEvent {
  type: EventType.APPROVAL_REQUEST_LIST;
  metadata: {
    policyType: string;
    count: number;
  };
}

export interface ApprovalRequestCreateEvent {
  type: EventType.APPROVAL_REQUEST_CREATE;
  metadata: {
    policyType: string;
    approvalRequestId: string;
    requesterName: string;
    requesterEmail: string;
    justification?: string;
    requestDuration: string;
  } & TAuditLogApprovalRequestSubject;
}

export interface ApprovalRequestApproveEvent {
  type: EventType.APPROVAL_REQUEST_APPROVE;
  metadata: {
    policyType: string;
    approvalRequestId: string;
    requesterName: string;
    requesterEmail: string;
    comment?: string;
  } & TAuditLogApprovalRequestSubject;
}

export interface ApprovalRequestAutoApproveEvent {
  type: EventType.APPROVAL_REQUEST_AUTO_APPROVE;
  metadata: {
    policyType: string;
    approvalRequestId: string;
    requesterName: string;
    requesterEmail: string;
  } & TAutoApprovalAuditMetadata &
    TAuditLogApprovalRequestSubject;
}

export interface ApprovalRequestRejectEvent {
  type: EventType.APPROVAL_REQUEST_REJECT;
  metadata: {
    policyType: string;
    approvalRequestId: string;
    requesterName: string;
    requesterEmail: string;
    comment?: string;
  } & TAuditLogApprovalRequestSubject;
}

export interface ApprovalRequestCancelEvent {
  type: EventType.APPROVAL_REQUEST_CANCEL;
  metadata: {
    policyType: string;
    approvalRequestId: string;
    requesterName: string;
    requesterEmail: string;
    // Set when Infisical cancelled the request rather than its requester.
    reason?: string;
  } & TAuditLogApprovalRequestSubject;
}

export interface ApprovalRequestGrantListEvent {
  type: EventType.APPROVAL_REQUEST_GRANT_LIST;
  metadata: {
    policyType: string;
    count: number;
  };
}

export interface ApprovalRequestGrantGetEvent {
  type: EventType.APPROVAL_REQUEST_GRANT_GET;
  metadata: {
    policyType: string;
    grantId: string;
    status: string;
  };
}

export interface ApprovalRequestGrantRevokeEvent {
  type: EventType.APPROVAL_REQUEST_GRANT_REVOKE;
  metadata: {
    policyType: string;
    grantId: string;
    revocationReason?: string;
  };
}

export interface AccessApprovalRequestCreateEvent {
  type: EventType.ACCESS_APPROVAL_REQUEST_CREATE;
  metadata: {
    requestId: string;
    policyId: string;
    isTemporary: boolean;
    temporaryRange?: string;
    permissions: unknown;
    note?: string;
  };
}

export interface AccessApprovalRequestReviewEvent {
  type: EventType.ACCESS_APPROVAL_REQUEST_REVIEW;
  metadata: {
    requestId: string;
    policyId: string;
    reviewStatus: string;
    isBypass?: boolean;
    bypassReason?: string;
  };
}

export interface AccessApprovalRequestRevokeEvent {
  type: EventType.ACCESS_APPROVAL_REQUEST_REVOKE;
  metadata: {
    requestId: string;
    requestedByUserId: string;
    policyId: string;
  };
}

export interface AccessApprovalRequestDelegatedDispatchRetryEvent {
  type: EventType.ACCESS_APPROVAL_REQUEST_DELEGATED_DISPATCH_RETRY;
  metadata: {
    requestId: string;
    requestedByUserId: string;
    requestedByUserName: string;
    requestedByUserEmail: string;
    policyId: string;
    policyName: string;
    environment: string;
    secretPath: string;
    delegatedApprovalType: string;
  };
}

export interface AccessApprovalRequestDelegatedDecisionEvent {
  type: EventType.ACCESS_APPROVAL_REQUEST_DELEGATED_DECISION;
  metadata: {
    requestId: string;
    policyId: string;
    policyName?: string;
    delegatedApprovalType: string;
    delegatedProviderRequestId: string;
    providerRecordNumber?: string;
    permissions?: string[];
    outcome: string;
    decision?: string;
    approvedBy?: string[];
    decidedAt?: string;
    decisionNotes?: string;
    reason?: string;
  };
}

export interface AccessApprovalRequestCancelEvent {
  type: EventType.ACCESS_APPROVAL_REQUEST_CANCEL;
  metadata: {
    requestId: string;
    requestedByUserId: string;
    requestedByUserName: string;
    requestedByUserEmail: string;
    policyId: string;
    policyName: string;
    environment: string;
    secretPath: string;
  };
}

export interface AccessApprovalRequestUpdateEvent {
  type: EventType.ACCESS_APPROVAL_REQUEST_UPDATE;
  metadata: {
    requestId: string;
    policyId: string;
    temporaryRange: string;
    editNote: string;
  };
}

export type TAuditLogApprovalRequestSubject = {
  certificateRequestId?: string;
  certificateId?: string;
  commonName?: string;
  profileName?: string;
  signerId?: string;
  signerName?: string;
};

export type TApprovalsAuditLogEvent =
  | SecretApprovalMerge
  | SecretApprovalClosed
  | SecretApprovalReopened
  | SecretApprovalRequest
  | SecretApprovalRequestReview
  | ProjectAccessRequestEvent
  | ProjectAssumePrivilegesEvent
  | ProjectAssumePrivilegesExitEvent
  | ApprovalPolicyCreateEvent
  | ApprovalPolicyUpdateEvent
  | ApprovalPolicyDeleteEvent
  | ApprovalPolicyListEvent
  | ApprovalPolicyGetEvent
  | ApprovalRequestGetEvent
  | ApprovalRequestListEvent
  | ApprovalRequestCreateEvent
  | ApprovalRequestApproveEvent
  | ApprovalRequestAutoApproveEvent
  | ApprovalRequestRejectEvent
  | ApprovalRequestCancelEvent
  | ApprovalRequestGrantListEvent
  | ApprovalRequestGrantGetEvent
  | ApprovalRequestGrantRevokeEvent
  | AccessApprovalRequestCreateEvent
  | AccessApprovalRequestReviewEvent
  | AccessApprovalRequestRevokeEvent
  | AccessApprovalRequestDelegatedDispatchRetryEvent
  | AccessApprovalRequestDelegatedDecisionEvent
  | AccessApprovalRequestCancelEvent
  | AccessApprovalRequestUpdateEvent;
