import { TProjectPermission } from "@app/lib/types";
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
  approvers: string[];
  projectSlug: string;
  name: string;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateAccessApprovalPolicy = {
  policyId: string;
  approvals?: number;
  approvers?: string[];
  secretPath?: string;
  name?: string;
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
