export type TSecretApprovalPolicy = {
  _id: string;
  workspace: string;
  environment: string;
  secretPath?: string;
  approvers: string[];
  approvals: number;
};

export type TCreateSecretPolicyDTO = {
  workspaceId: string;
  environment: string;
  secretPath?: string | null;
  approvers?: string[];
  approvals?: number;
};

export type TUpdateSecretPolicyDTO = {
  id: string;
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
