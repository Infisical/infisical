import { EnforcementLevel } from "../policies/enums";
import { WorkspaceEnv } from "../workspace/types";

export type TSecretApprovalPolicy = {
  id: string;
  workspace: string;
  name: string;
  environments: WorkspaceEnv[];
  secretPath?: string;
  approvals: number;
  approvers: Approver[];
  updatedAt: Date;
  enforcementLevel: EnforcementLevel;
  allowedSelfApprovals: boolean;
};

export enum ApproverType {
  User = "user",
  Group = "group"
}

export type Approver = {
  id: string;
  type: ApproverType;
};

export enum BypasserType {
  User = "user",
  Group = "group"
}

export type Bypasser = {
  id: string;
  type: BypasserType;
};

export type TGetSecretApprovalPoliciesDTO = {
  workspaceId: string;
};

export type TGetSecretApprovalPolicyOfBoardDTO = {
  workspaceId: string;
  environment: string;
  secretPath: string;
};

export type TCreateSecretPolicyDTO = {
  workspaceId: string;
  name?: string;
  environments: string[];
  secretPath: string;
  approvers?: Approver[];
  bypassers?: Bypasser[];
  approvals?: number;
  enforcementLevel: EnforcementLevel;
  allowedSelfApprovals: boolean;
};

export type TUpdateSecretPolicyDTO = {
  id: string;
  name?: string;
  approvers?: Approver[];
  bypassers?: Bypasser[];
  secretPath?: string;
  approvals?: number;
  allowedSelfApprovals?: boolean;
  enforcementLevel?: EnforcementLevel;
  // for invalidating list
  workspaceId: string;
  environments?: string[];
};

export type TDeleteSecretPolicyDTO = {
  id: string;
  // for invalidating list
  workspaceId: string;
};
