import { EnforcementLevel, TProjectPermission } from "@app/lib/types";
import { ActorAuthMethod } from "@app/services/auth/auth-type";

import { TPermissionServiceFactory } from "../permission/permission-service";

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

export type TCreateAccessApprovalPolicy = {
  approvals: number;
  secretPath: string;
  environment: string;
  approvers: ({ type: ApproverType.Group; id: string } | { type: ApproverType.User; id?: string; name?: string })[];
  projectSlug: string;
  name: string;
  enforcementLevel: EnforcementLevel;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateAccessApprovalPolicy = {
  policyId: string;
  approvals?: number;
  approvers: ({ type: ApproverType.Group; id: string } | { type: ApproverType.User; id?: string; name?: string })[];
  secretPath?: string;
  name?: string;
  enforcementLevel?: EnforcementLevel;
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
