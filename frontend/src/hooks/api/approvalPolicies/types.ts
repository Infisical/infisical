export enum ApprovalPolicyType {
  PamAccess = "pam-access",
  CertRequest = "cert-request",
  CertCodeSigning = "cert-code-signing"
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

export type CodeSigningPolicyConditions = Record<string, never>[];

export type CodeSigningPolicyConstraints = {
  maxWindowDuration?: string;
  maxSignings?: number;
};

export type TApprovalPolicy = {
  id: string;
  projectId: string;
  name: string;
  maxRequestTtl?: string | null;
  type: ApprovalPolicyType;
  conditions: {
    version: number;
    conditions:
      | PamAccessPolicyConditions
      | CertRequestPolicyConditions
      | CodeSigningPolicyConditions;
  };
  constraints: {
    version: number;
    constraints:
      | PamAccessPolicyConstraints
      | CertRequestPolicyConstraints
      | CodeSigningPolicyConstraints;
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
  conditions: PamAccessPolicyConditions | CertRequestPolicyConditions | CodeSigningPolicyConditions;
  constraints:
    | PamAccessPolicyConstraints
    | CertRequestPolicyConstraints
    | CodeSigningPolicyConstraints;
  steps: ApprovalPolicyStep[];
  bypassForMachineIdentities?: boolean;
};

export type TUpdateApprovalPolicyDTO = {
  policyType: ApprovalPolicyType;
  policyId: string;
  name?: string;
  maxRequestTtl?: string | null;
  conditions?:
    | PamAccessPolicyConditions
    | CertRequestPolicyConditions
    | CodeSigningPolicyConditions;
  constraints?:
    | PamAccessPolicyConstraints
    | CertRequestPolicyConstraints
    | CodeSigningPolicyConstraints;
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
  inputs: { resourceName: string; accountName: string } | { profileName: string };
};

export type TCheckPolicyMatchResult = {
  requiresApproval: boolean;
  hasActiveGrant: boolean;
};
