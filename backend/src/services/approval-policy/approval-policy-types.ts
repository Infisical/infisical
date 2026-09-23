import { Knex } from "knex";

import { TApprovalPolicies, TApprovalRequestGrants, TApprovalRequests } from "@app/db/schemas";
import { Event } from "@app/ee/services/audit-log/audit-log-types";
import { ResourcePermissionApprovalPolicyActions } from "@app/ee/services/permission/resource-permission";
import { OrgServiceActor } from "@app/lib/types";
import { TNotification } from "@app/lib/workflow-integrations/types";
import { NotificationType } from "@app/services/notification/notification-types";
import { SmtpTemplates } from "@app/services/smtp/smtp-service";

import {
  ApprovalAuditAction,
  ApprovalNotificationEvent,
  ApprovalPolicyScope,
  ApprovalPolicyType,
  ApprovalRequestApprovalDecision,
  ApproverType,
  EnforcementLevel
} from "./approval-policy-enums";
import {
  TCertRequestPolicy,
  TCertRequestPolicyConditions,
  TCertRequestPolicyConstraints,
  TCertRequestPolicyInputs,
  TCertRequestRequest,
  TCertRequestRequestData
} from "./cert-request/cert-request-policy-types";
import {
  TCodeSigningPolicy,
  TCodeSigningPolicyConditions,
  TCodeSigningPolicyConstraints,
  TCodeSigningPolicyInputs,
  TCodeSigningRequest,
  TCodeSigningRequestData
} from "./code-signing/code-signing-policy-types";
import {
  TPamAccessPolicy,
  TPamAccessPolicyConditions,
  TPamAccessPolicyConstraints,
  TPamAccessPolicyInputs,
  TPamAccessRequest,
  TPamAccessRequestData
} from "./pam-access/pam-access-policy-types";

export type TApprovalActor = Pick<OrgServiceActor, "id" | "type" | "authMethod" | "orgId">;

export type TApprovalSubjectActor = Pick<TApprovalActor, "id" | "type">;

export type TApprovalPolicy = TPamAccessPolicy | TCertRequestPolicy | TCodeSigningPolicy;
export type TApprovalPolicyInputs = TPamAccessPolicyInputs | TCertRequestPolicyInputs | TCodeSigningPolicyInputs;
export type TApprovalPolicyConditions =
  | TPamAccessPolicyConditions
  | TCertRequestPolicyConditions
  | TCodeSigningPolicyConditions;
export type TApprovalPolicyConstraints =
  | TPamAccessPolicyConstraints
  | TCertRequestPolicyConstraints
  | TCodeSigningPolicyConstraints;

export type TApprovalRequest = TPamAccessRequest | TCertRequestRequest | TCodeSigningRequest;
export type TApprovalRequestData = TPamAccessRequestData | TCertRequestRequestData | TCodeSigningRequestData;

// Bypass-affordance fields the service stamps onto every request response.
export type TBypassAffordances = {
  canBreakGlass: boolean;
  isBreakGlass: boolean;
  bypassReason: string | null;
};

export type BreakGlassBypassMetadata = {
  grantId: string;
  bypassReason: string;
  approverCount: number;
};

export type TDecorationContext = {
  getUserGroupIds: () => Promise<Set<string>>;
  grantsByRequestId?: Map<string, { isBreakGlass: boolean; bypassReason: string | null }>;
  policyById?: Map<string, TApprovalPolicies>;
  bypassersByPolicyId?: Map<string, PolicyBypasser[]>;
};

export interface ApprovalPolicyStep {
  name?: string | null;
  requiredApprovals: number;
  notifyApprovers?: boolean | null;
  approvers: {
    type: ApproverType;
    id: string;
  }[];
}

export interface PolicyBypasser {
  type: ApproverType;
  id: string;
}

// Policy DTOs
export interface TCreatePolicyDTO {
  scope: ApprovalPolicyScope;
  scopeId: string;
  name: TApprovalPolicy["name"];
  maxRequestTtl?: TApprovalPolicy["maxRequestTtl"];
  conditions: TApprovalPolicy["conditions"]["conditions"];
  constraints: TApprovalPolicy["constraints"]["constraints"];
  steps: ApprovalPolicyStep[];
  bypassForMachineIdentities?: boolean;
  enforcementLevel?: EnforcementLevel;
  bypassers?: PolicyBypasser[];
}

export interface TUpdatePolicyDTO {
  name?: TApprovalPolicy["name"];
  maxRequestTtl?: TApprovalPolicy["maxRequestTtl"];
  conditions?: TApprovalPolicy["conditions"]["conditions"];
  constraints?: TApprovalPolicy["constraints"]["constraints"];
  steps?: ApprovalPolicyStep[];
  bypassForMachineIdentities?: boolean;
  enforcementLevel?: EnforcementLevel;
  bypassers?: PolicyBypasser[];
}

// Request DTOs
export interface TCreateRequestDTO {
  scope: ApprovalPolicyScope;
  scopeId: string;
  requestData: TApprovalRequest["requestData"]["requestData"];
  justification?: TApprovalRequest["justification"];
  requestDuration?: string | null;
}

export interface TCreateRequestFromPolicyDTO {
  projectId: string;
  organizationId: string;
  policy: TApprovalPolicy;
  requestData: TApprovalRequest["requestData"]["requestData"];
  justification?: string | null;
  expiresAt?: Date | null;
  requesterUserId?: string | null;
  machineIdentityId?: string | null;
  requesterName: string;
  requesterEmail: string;
  tx?: Knex;
}

export type TApprovalNotification = {
  inApp?: { type: NotificationType; title: string; body: string; link?: string };
  email?: { subjectLine: string; template: SmtpTemplates; substitutions: Record<string, unknown> };
  chat?: { workflowIntegrationId: string; channelIds: string[]; notification: TNotification }[];
};

// The one extension point: a policy type implements this and registers it at wiring time. Only the
// first three members are required; everything else falls back to shared behaviour.
export type TApprovalResource<
  I extends TApprovalPolicyInputs = TApprovalPolicyInputs,
  P extends TApprovalPolicy = TApprovalPolicy,
  R extends TApprovalRequestData = TApprovalRequestData
> = {
  matchPolicy: (projectId: string, inputs: I) => Promise<P | null>;
  canAccess: (projectId: string, actorId: string, inputs: I) => Promise<TApprovalRequestGrants | null>;
  validateConstraints: (policy: P, requestData: R) => { valid: boolean; errors?: string[] };

  // Whatever the approval entitles the requester to goes in the Tx variant, which commits with the
  // approval; anything reaching outside the database goes in postApprovalRoutine, after the commit.
  postApprovalTxRoutine?: (
    request: TApprovalRequest,
    tx: Knex,
    breakGlass?: { bypassReason: string }
  ) => Promise<{ grantId: string } | void>;
  postApprovalRoutine?: (request: TApprovalRequest, actor?: TApprovalActor) => Promise<void>;
  postRejectionRoutine?: (request: TApprovalRequest) => Promise<void>;

  // Whether a stored grant's attributes or a request's payload is for the thing these inputs name.
  // Without it the access-status and reaping helpers have nothing to match on.
  matchesInputs?: (payload: unknown, inputs: TApprovalPolicyInputs) => boolean;

  // Whether the actor is still an approver for the scope, for a type where the request's creation-time
  // approver snapshot can outlive the membership behind it.
  isLiveApprover?: (args: {
    projectId: string;
    scopeId: string;
    actor: TApprovalActor;
    userGroupIds: Set<string>;
  }) => Promise<boolean>;

  // The audit event a lifecycle action owes. A type whose auditors filter on resource ids contributes
  // its own event here; returning nothing leaves the generic approval event in place.
  buildAuditEvent?: (args: {
    action: ApprovalAuditAction;
    request: TApprovalRequests;
    grantId?: string;
    actorId: string;
    comment?: string;
    bypassReason?: string;
  }) => Promise<Event | null>;

  // Copy and chat routing for a lifecycle event. Returning nothing sends nothing.
  buildNotification?: (args: {
    event: ApprovalNotificationEvent;
    request: TApprovalRequests;
    comment?: string;
    bypassReason?: string;
  }) => Promise<TApprovalNotification | null>;
  // Narrows the notified approvers to those still eligible, for a type where an approver row can
  // outlive the membership behind it.
  filterActiveApprovers?: (
    request: TApprovalRequests,
    approvers: { type: ApproverType; id: string }[]
  ) => Promise<{ type: ApproverType; id: string }[]>;

  // Scope and authorization the service cannot work out on its own. Without these it resolves project
  // and application scopes itself, authorizes policy CRUD against project admin, and requires
  // approvers to be project members.
  resolveScope?: (scopeId: string) => Promise<{ projectId: string }>;
  // The default reads as an invitation to go ahead, which is wrong where an unconfigured scope is a
  // misconfiguration to report.
  noMatchingPolicyMessage?: string;
  assertCanManagePolicy?: (args: {
    projectId: string;
    scopeId: string | null;
    actor: TApprovalActor;
    action: ResourcePermissionApprovalPolicyActions;
  }) => Promise<void>;
  verifyPolicyActors?: (args: {
    projectId: string;
    scopeId: string | null;
    approvers: PolicyBypasser[];
    bypassers: PolicyBypasser[];
  }) => Promise<void>;
  assertCanCreateRequest?: (args: {
    projectId: string;
    policy: TApprovalPolicy;
    requestData: TApprovalRequestData;
    actor: TApprovalActor;
  }) => Promise<void>;
  assertCanReview?: (args: {
    request: TApprovalRequests;
    decision: ApprovalRequestApprovalDecision;
    actor: TApprovalActor;
    userGroupIds: Set<string>;
  }) => Promise<void>;
  // The default treats an empty bypasser list as everybody; a type reading it the other way says so here.
  isBreakGlassEligible?: (args: {
    request: TApprovalRequests;
    policy: TApprovalPolicies;
    bypassers: PolicyBypasser[];
    actor: TApprovalActor;
    userGroupIds: Set<string>;
  }) => Promise<boolean>;
  assertCanRevokeGrant?: (args: {
    grant: TApprovalRequestGrants;
    request: TApprovalRequests | null;
    actor: TApprovalActor;
  }) => Promise<void>;
  // Returns the side effects to fire once the revocation is durable, so a caller inside a transaction
  // that can still roll back cuts nothing early.
  onGrantRevoked?: (args: { grant: TApprovalRequestGrants; actorId: string; tx?: Knex }) => Promise<() => void>;
};

export enum ApprovalAccessStatus {
  None = "none",
  Pending = "pending",
  Granted = "granted"
}

export type TApprovalAccessStatus = {
  accessStatus: ApprovalAccessStatus;
  grantExpiresAt: Date | null;
  pendingRequestId: string | null;
};

export type TApprovalScopeConfiguration = {
  steps: { requiredApprovals: number; approvers: PolicyBypasser[] }[];
  bypassers: PolicyBypasser[];
};

export type TApprovalResourceRegistry = Partial<Record<ApprovalPolicyType, TApprovalResource>>;

export type TApprovalRequestSubjectMetadata = {
  certificateRequestId?: string;
  commonName?: string;
  profileName?: string;
  signerId?: string;
  signerName?: string;
};
