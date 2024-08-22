import { EnforcementLevel, TProjectPermission } from "@app/lib/types";
import { ActorAuthMethod } from "@app/services/auth/auth-type";

import { TPermissionServiceFactory } from "../permission/permission-service";

export type TVerifyApprovers = {
  userIds: string[];
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  envSlug: string;
  actorAuthMethod: ActorAuthMethod;
  secretPath: string;
  projectId: string;
  orgId: string;
};

export type TCreateAccessApprovalPolicy = {
  approvals: number;
  secretPath: string;
  environment: string;
  approverUserIds: string[];
  projectSlug: string;
  name: string;
  enforcementLevel: EnforcementLevel;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateAccessApprovalPolicy = {
  policyId: string;
  approvals?: number;
  approverUserIds?: string[];
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

export type TListAccessApprovalPoliciesDTO = {
  projectSlug: string;
} & Omit<TProjectPermission, "projectId">;
