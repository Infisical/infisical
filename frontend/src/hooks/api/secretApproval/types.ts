export type TSecretApprovalPolicy = {
  _id: string;
  workspace: string;
  name: string;
  environment: string;
  secretPath?: string;
  approvers: string[];
  approvals: number;
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
  approvers?: string[];
  approvals?: number;
};

export type TUpdateSecretPolicyDTO = {
  id: string;
  name?: string;
  approvers?: string[];
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
