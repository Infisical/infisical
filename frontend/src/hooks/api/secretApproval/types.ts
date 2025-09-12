import { EnforcementLevel } from "../policies/enums";
import { WorkspaceEnv } from "../workspace/types";

export type TSecretApprovalPolicy = {
  id: string;
  project: string;
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
  isOrgMembershipActive: boolean;
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
  projectId: string;
};

export type TGetSecretApprovalPolicyOfBoardDTO = {
  projectId: string;
  environment: string;
  secretPath: string;
};

export type TCreateSecretPolicyDTO = {
  projectId: string;
  name?: string;
  environments: string[];
  secretPath: string;
  approvers?: Omit<Approver, "isOrgMembershipActive">[];
  bypassers?: Bypasser[];
  approvals?: number;
  enforcementLevel: EnforcementLevel;
  allowedSelfApprovals: boolean;
};

export type TUpdateSecretPolicyDTO = {
  id: string;
  name?: string;
  approvers?: Omit<Approver, "isOrgMembershipActive">[];
  bypassers?: Bypasser[];
  secretPath?: string;
  approvals?: number;
  allowedSelfApprovals?: boolean;
  enforcementLevel?: EnforcementLevel;
  // for invalidating list
  projectId: string;
  environments?: string[];
};

export type TDeleteSecretPolicyDTO = {
  id: string;
  // for invalidating list
  projectId: string;
};
