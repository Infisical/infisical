import { EnforcementLevel } from "../policies/enums";
import { WorkspaceEnv } from "../workspace/types";

export type TSecretApprovalPolicy = {
  id: string;
  workspace: string;
  name: string;
  envId: string;
  environment: WorkspaceEnv;
  secretPaths: string[];
  approvals: number;
  approvers: Approver[];
  updatedAt: Date;
  enforcementLevel: EnforcementLevel;
};

export enum ApproverType {
  User = "user",
  Group = "group"
}

export type Approver = {
  id: string;
  type: ApproverType;
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
  environment: string;
  secretPaths: string[];
  approvers?: Approver[];
  approvals?: number;
  enforcementLevel: EnforcementLevel;
};

export type TUpdateSecretPolicyDTO = {
  id: string;
  name?: string;
  approvers?: Approver[];
  secretPaths?: string[];
  approvals?: number;
  enforcementLevel?: EnforcementLevel;
  // for invalidating list
  workspaceId: string;
};

export type TDeleteSecretPolicyDTO = {
  id: string;
  // for invalidating list
  workspaceId: string;
};
