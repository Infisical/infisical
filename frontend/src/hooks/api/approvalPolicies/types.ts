export enum ApprovalPolicyType {
  PamAccess = "pam-access",
  CertRequest = "cert-request"
}

export enum ApproverType {
  Group = "group",
  User = "user"
}

export type ApprovalPolicyStep = {
  name?: string | null;
  requiredApprovals: number;
  notifyApprovers?: boolean;
  approvers: {
    type: ApproverType;
    id: string;
  }[];
};

export type PamAccessPolicyConditions = {
  // Deprecated: use resourceNames and accountNames instead
  accountPaths?: string[];
  // New fields for matching
  resourceNames?: string[];
  accountNames?: string[];
}[];

export type PamAccessPolicyConstraints = {
  accessDuration: {
    min: string;
    max: string;
  };
};

export type CertRequestPolicyConditions = {
  profileNames: string[];
}[];

export type CertRequestPolicyConstraints = Record<string, never>;

export type TApprovalPolicy = {
  id: string;
  projectId: string;
  name: string;
  maxRequestTtl?: string | null;
  type: ApprovalPolicyType;
  conditions: {
    version: number;
    conditions: PamAccessPolicyConditions | CertRequestPolicyConditions;
  };
  constraints: {
    version: number;
    constraints: PamAccessPolicyConstraints | CertRequestPolicyConstraints;
  };
  steps: ApprovalPolicyStep[];
  bypassForMachineIdentities?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TCreateApprovalPolicyDTO = {
  policyType: ApprovalPolicyType;
  projectId: string;
  name: string;
  maxRequestTtl?: string | null;
  conditions: PamAccessPolicyConditions | CertRequestPolicyConditions;
  constraints: PamAccessPolicyConstraints | CertRequestPolicyConstraints;
  steps: ApprovalPolicyStep[];
  bypassForMachineIdentities?: boolean;
};

export type TUpdateApprovalPolicyDTO = {
  policyType: ApprovalPolicyType;
  policyId: string;
  name?: string;
  maxRequestTtl?: string | null;
  conditions?: PamAccessPolicyConditions | CertRequestPolicyConditions;
  constraints?: PamAccessPolicyConstraints | CertRequestPolicyConstraints;
  steps?: ApprovalPolicyStep[];
  bypassForMachineIdentities?: boolean;
};

export type TGetApprovalPolicyByIdDTO = {
  policyType: ApprovalPolicyType;
  policyId: string;
};

export type TListApprovalPoliciesDTO = {
  policyType: ApprovalPolicyType;
  projectId: string;
};

export type TDeleteApprovalPolicyDTO = {
  policyType: ApprovalPolicyType;
  policyId: string;
};

export type TCheckPolicyMatchDTO = {
  policyType: ApprovalPolicyType;
  projectId: string;
  inputs:
    | { accountPath?: string; resourceName?: string; accountName?: string }
    | { profileName: string };
};

export type TCheckPolicyMatchResult = {
  requiresApproval: boolean;
  hasActiveGrant: boolean;
};
