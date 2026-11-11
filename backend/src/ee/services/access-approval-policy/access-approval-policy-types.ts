import { ActorAuthMethod } from "@app/lib/auth/actor-types";
import { EnforcementLevel, OrgServiceActor, TActorInput } from "@app/lib/types";
import { TDelegatedApprovalPolicyInput } from "@app/services/delegated-approval/delegated-approval-types";

import { TPermissionServiceFactory } from "../permission/permission-service-types";

export type TIsApproversValid = {
  userIds: string[];
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  envSlug: string;
  actorAuthMethod: ActorAuthMethod;
  secretPath: string;
  projectId: string;
  orgId: string;
};

export enum ApproverType {
  Group = "group",
  User = "user"
}

export enum BypasserType {
  Group = "group",
  User = "user"
}

export type TDelegatedApprovalPolicyOutput = TDelegatedApprovalPolicyInput;

export type TCreateAccessApprovalPolicy = {
  approvals: number;
  secretPath: string;
  environment?: string;
  environments?: string[];
  approvers: (
    | { type: ApproverType.Group; id: string; sequence?: number }
    | { type: ApproverType.User; id?: string; username?: string; sequence?: number }
  )[];
  bypassers?: (
    | { type: BypasserType.Group; id: string }
    | { type: BypasserType.User; id?: string; username?: string }
  )[];
  projectSlug: string;
  name: string;
  enforcementLevel: EnforcementLevel;
  allowedSelfApprovals?: boolean;
  approvalsRequired?: { numberOfApprovals: number; stepNumber: number }[];
  maxTimePeriod?: string | null;
  requestExpirationTime?: string | null;
  delegatedApproval?: TDelegatedApprovalPolicyInput;
  orgActor: OrgServiceActor;
} & TActorInput;

export type TUpdateAccessApprovalPolicy = {
  policyId: string;
  approvals?: number;
  approvers: (
    | { type: ApproverType.Group; id: string; sequence?: number }
    | { type: ApproverType.User; id?: string; username?: string; sequence?: number }
  )[];
  bypassers?: (
    | { type: BypasserType.Group; id: string }
    | { type: BypasserType.User; id?: string; username?: string }
  )[];
  secretPath?: string;
  name?: string;
  enforcementLevel?: EnforcementLevel;
  allowedSelfApprovals?: boolean;
  approvalsRequired?: { numberOfApprovals: number; stepNumber: number }[];
  environments?: string[];
  maxTimePeriod?: string | null;
  requestExpirationTime?: string | null;
  delegatedApproval?: TDelegatedApprovalPolicyInput | null;
  orgActor: OrgServiceActor;
} & TActorInput;

export type TDeleteAccessApprovalPolicy = {
  policyId: string;
} & TActorInput;

export type TGetAccessPolicyCountByEnvironmentDTO = {
  envSlug: string;
  projectSlug: string;
} & TActorInput;

export type TGetAccessApprovalPolicyByIdDTO = {
  policyId: string;
} & TActorInput;

export type TListAccessApprovalPoliciesDTO = {
  projectSlug: string;
} & TActorInput;

export interface TAccessApprovalPolicyServiceFactory {
  getAccessPolicyCountByEnvSlug: ({ actor, projectSlug, envSlug }: TGetAccessPolicyCountByEnvironmentDTO) => Promise<{
    count: number;
  }>;
  createAccessApprovalPolicy: ({
    name,
    actor,
    secretPath,
    approvals,
    approvers,
    bypassers,
    projectSlug,
    environment,
    enforcementLevel,
    allowedSelfApprovals,
    approvalsRequired,
    maxTimePeriod
  }: TCreateAccessApprovalPolicy) => Promise<{
    environment: {
      name: string;
      id: string;
      createdAt: Date;
      updatedAt: Date;
      projectId: string;
      slug: string;
      position: number;
    };
    environments: {
      name: string;
      id: string;
      createdAt: Date;
      updatedAt: Date;
      projectId: string;
      slug: string;
      position: number;
    }[];
    projectId: string;
    name: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    approvals: number;
    envId: string;
    enforcementLevel: string;
    allowedSelfApprovals: boolean;
    secretPath: string;
    deletedAt?: Date | null | undefined;
    maxTimePeriod?: string | null;
    requestExpirationTime?: string | null;
    delegatedApproval?: TDelegatedApprovalPolicyOutput | null;
  }>;
  deleteAccessApprovalPolicy: ({ policyId, actor }: TDeleteAccessApprovalPolicy) => Promise<{
    approvers: {
      id: string | null | undefined;
      type: string;
      sequence: number | null | undefined;
      approvalsRequired: number | null | undefined;
    }[];
    name: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    approvals: number;
    envId: string;
    enforcementLevel: string;
    allowedSelfApprovals: boolean;
    secretPath: string;
    deletedAt?: Date | null | undefined;
    maxTimePeriod?: string | null;
    requestExpirationTime?: string | null;
    environment: {
      id: string;
      name: string;
      slug: string;
    };
    environments: {
      id: string;
      name: string;
      slug: string;
    }[];
    projectId: string;
    delegatedApproval?: TDelegatedApprovalPolicyOutput | null;
  }>;
  updateAccessApprovalPolicy: ({
    policyId,
    approvers,
    bypassers,
    secretPath,
    name,
    actor,
    approvals,
    enforcementLevel,
    allowedSelfApprovals,
    approvalsRequired,
    environments,
    maxTimePeriod
  }: TUpdateAccessApprovalPolicy) => Promise<{
    environment: {
      id: string;
      name: string;
      slug: string;
    };
    environments: {
      id: string;
      name: string;
      slug: string;
    }[];
    projectId: string;
    name: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    approvals: number;
    envId: string;
    enforcementLevel: string;
    allowedSelfApprovals: boolean;
    secretPath: string;
    deletedAt?: Date | null | undefined;
    maxTimePeriod?: string | null;
    delegatedApproval?: TDelegatedApprovalPolicyOutput | null;
  }>;
  getAccessApprovalPolicyByProjectSlug: ({ actor, projectSlug }: TListAccessApprovalPoliciesDTO) => Promise<
    {
      approvers: (
        | {
            id: string | null | undefined;
            type: ApproverType;
            name: string;
            sequence: number | null | undefined;
            approvalsRequired: number | null | undefined;
          }
        | {
            id: string | null | undefined;
            type: ApproverType;
            sequence: number | null | undefined;
            approvalsRequired: number | null | undefined;
          }
      )[];
      name: string;
      id: string;
      createdAt: Date;
      updatedAt: Date;
      approvals: number;
      envId: string;
      enforcementLevel: string;
      allowedSelfApprovals: boolean;
      secretPath: string;
      deletedAt?: Date | null | undefined;
      maxTimePeriod?: string | null;
      environment: {
        id: string;
        name: string;
        slug: string;
      };
      environments: {
        id: string;
        name: string;
        slug: string;
      }[];
      projectId: string;
      bypassers: (
        | {
            id: string | null | undefined;
            type: BypasserType;
            name: string;
          }
        | {
            id: string | null | undefined;
            type: BypasserType;
          }
      )[];
      delegatedApproval?: TDelegatedApprovalPolicyOutput | null;
    }[]
  >;
  getAccessApprovalPolicyById: ({ actor, policyId }: TGetAccessApprovalPolicyByIdDTO) => Promise<{
    approvers: (
      | {
          id: string | null | undefined;
          type: ApproverType.User;
          name: string;
          sequence: number | null | undefined;
          approvalsRequired: number | null | undefined;
        }
      | {
          id: string | null | undefined;
          type: ApproverType.Group;
          sequence: number | null | undefined;
          approvalsRequired: number | null | undefined;
        }
    )[];
    name: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    approvals: number;
    envId: string;
    enforcementLevel: string;
    allowedSelfApprovals: boolean;
    secretPath: string;
    deletedAt?: Date | null | undefined;
    maxTimePeriod?: string | null;
    requestExpirationTime?: string | null;
    environment: {
      id: string;
      name: string;
      slug: string;
    };
    environments: {
      id: string;
      name: string;
      slug: string;
    }[];
    projectId: string;
    bypassers: (
      | {
          id: string | null | undefined;
          type: BypasserType.User;
          name: string;
        }
      | {
          id: string | null | undefined;
          type: BypasserType.Group;
        }
    )[];
    delegatedApproval?: TDelegatedApprovalPolicyOutput | null;
  }>;
}
