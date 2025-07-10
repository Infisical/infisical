import { EnforcementLevel, TProjectPermission } from "@app/lib/types";
import { ActorAuthMethod } from "@app/services/auth/auth-type";

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

export type TCreateAccessApprovalPolicy = {
  approvals: number;
  secretPath: string;
  environment: string;
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
  allowedSelfApprovals: boolean;
  approvalsRequired?: { numberOfApprovals: number; stepNumber: number }[];
} & Omit<TProjectPermission, "projectId">;

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
  allowedSelfApprovals: boolean;
  approvalsRequired?: { numberOfApprovals: number; stepNumber: number }[];
} & Omit<TProjectPermission, "projectId">;

export type TDeleteAccessApprovalPolicy = {
  policyId: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetAccessPolicyCountByEnvironmentDTO = {
  envSlug: string;
  projectSlug: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetAccessApprovalPolicyByIdDTO = {
  policyId: string;
} & Omit<TProjectPermission, "projectId">;

export type TListAccessApprovalPoliciesDTO = {
  projectSlug: string;
} & Omit<TProjectPermission, "projectId">;

export interface TAccessApprovalPolicyServiceFactory {
  getAccessPolicyCountByEnvSlug: ({
    actor,
    actorOrgId,
    actorAuthMethod,
    projectSlug,
    actorId,
    envSlug
  }: TGetAccessPolicyCountByEnvironmentDTO) => Promise<{
    count: number;
  }>;
  createAccessApprovalPolicy: ({
    name,
    actor,
    actorId,
    actorOrgId,
    secretPath,
    actorAuthMethod,
    approvals,
    approvers,
    bypassers,
    projectSlug,
    environment,
    enforcementLevel,
    allowedSelfApprovals,
    approvalsRequired
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
  }>;
  deleteAccessApprovalPolicy: ({
    policyId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TDeleteAccessApprovalPolicy) => Promise<{
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
    environment: {
      id: string;
      name: string;
      slug: string;
    };
    projectId: string;
  }>;
  updateAccessApprovalPolicy: ({
    policyId,
    approvers,
    bypassers,
    secretPath,
    name,
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    approvals,
    enforcementLevel,
    allowedSelfApprovals,
    approvalsRequired
  }: TUpdateAccessApprovalPolicy) => Promise<{
    environment: {
      id: string;
      name: string;
      slug: string;
    };
    projectId: string;
    name: string;
    id: string;
    createdAt: Date;
    updatedAt: Date;
    approvals: number;
    envId: string;
    enforcementLevel: string;
    allowedSelfApprovals: boolean;
    secretPath?: string | null | undefined;
    deletedAt?: Date | null | undefined;
  }>;
  getAccessApprovalPolicyByProjectSlug: ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    projectSlug
  }: TListAccessApprovalPoliciesDTO) => Promise<
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
      environment: {
        id: string;
        name: string;
        slug: string;
      };
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
    }[]
  >;
  getAccessApprovalPolicyById: ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    policyId
  }: TGetAccessApprovalPolicyByIdDTO) => Promise<{
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
    environment: {
      id: string;
      name: string;
      slug: string;
    };
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
  }>;
}
