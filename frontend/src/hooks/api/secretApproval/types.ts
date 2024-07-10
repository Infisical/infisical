import { WorkspaceEnv } from "../workspace/types";

export type TSecretApprovalPolicy = {
  id: string;
  workspace: string;
  name: string;
  envId: string;
  environment: WorkspaceEnv;
  secretPath?: string;
  approvals: number;
  userApprovers: { userId: string }[];
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
  secretPath?: string | null;
  approverUserIds?: string[];
  approvals?: number;
};

export type TUpdateSecretPolicyDTO = {
  id: string;
  name?: string;
  approverUserIds?: string[];
  secretPath?: string | null;
  approvals?: number;
  // for invalidating list
  workspaceId: string;
};

export type TDeleteSecretPolicyDTO = {
  id: string;
  // for invalidating list
  workspaceId: string;
};
