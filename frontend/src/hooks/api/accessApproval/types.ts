import { WorkspaceEnv } from "../workspace/types";

export type TAccessApprovalPolicy = {
  id: string;
  name: string;
  approvals: number;
  envId: string;
  workspace: string;
  environment: WorkspaceEnv;
  projectId: string;
  approvers: string[];
};

export type TGetSecretApprovalPoliciesDTO = {
  workspaceId: string;
};

export type TGetSecretApprovalPolicyOfBoardDTO = {
  workspaceId: string;
  environment: string;
  secretPath: string;
};

export type TCreateAccessPolicyDTO = {
  workspaceId: string;
  name?: string;
  environment: string;
  approvers?: string[];
  approvals?: number;
};

export type TUpdateAccessPolicyDTO = {
  id: string;
  name?: string;
  approvers?: string[];
  approvals?: number;
  // for invalidating list
  workspaceId: string;
};

export type TDeleteSecretPolicyDTO = {
  id: string;
  // for invalidating list
  workspaceId: string;
};
