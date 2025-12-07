export enum ApprovalPolicyType {
  PamAccess = "pam-access"
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
  accountPaths: string[];
}[];

export type PamAccessPolicyConstraints = {
  accessDuration: {
    min: string;
    max: string;
  };
};

export type TApprovalPolicy = {
  id: string;
  projectId: string;
  name: string;
  maxRequestTtl?: string | null;
  type: ApprovalPolicyType;
  conditions: {
    version: number;
    conditions: PamAccessPolicyConditions;
  };
  constraints: {
    version: number;
    constraints: PamAccessPolicyConstraints;
  };
  steps: ApprovalPolicyStep[];
  createdAt: string;
  updatedAt: string;
};

export type TCreateApprovalPolicyDTO = {
  policyType: ApprovalPolicyType;
  projectId: string;
  name: string;
  maxRequestTtl?: string | null;
  conditions: PamAccessPolicyConditions;
  constraints: PamAccessPolicyConstraints;
  steps: ApprovalPolicyStep[];
};

export type TUpdateApprovalPolicyDTO = {
  policyType: ApprovalPolicyType;
  policyId: string;
  name?: string;
  maxRequestTtl?: string | null;
  conditions?: PamAccessPolicyConditions;
  constraints?: PamAccessPolicyConstraints;
  steps?: ApprovalPolicyStep[];
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
