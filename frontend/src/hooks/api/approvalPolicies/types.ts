import { AppConnection } from "@app/hooks/api/appConnections/enums";

export enum ApprovalPolicyType {
  PamAccess = "pam-access",
  CertRequest = "cert-request",
  CertCodeSigning = "cert-code-signing"
}

export enum ApprovalPolicyScope {
  Project = "project",
  PkiApplication = "pki-application",
  PamFolder = "pam-folder"
}

export enum ApproverType {
  Group = "group",
  User = "user"
}

export enum EnforcementLevel {
  Hard = "hard",
  Soft = "soft"
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

export type PolicyBypasser = {
  type: ApproverType;
  id: string;
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

// Conditions on the requester's own account in a service carry this subject and no input
export const AUTO_APPROVAL_REQUESTER_SUBJECT = "requester";

export enum AutoApprovalConstraintValue {
  None = "none",
  One = "one",
  Many = "many"
}

export type TAutoApprovalInput = { connectionId: string; subject: string };

export type TAutoApprovalCondition = {
  connectionId: string;
  subject: string;
  constraint: string;
  values: string[];
};

export type TAutoApprovalConfig = {
  inputs: TAutoApprovalInput[];
  rules: { name: string; conditions: TAutoApprovalCondition[] }[];
};

export type TAutoApprovalConfigResponse = {
  inputs: (TAutoApprovalInput & { id: string })[];
  rules: { id: string; name: string; conditions: (TAutoApprovalCondition & { id: string })[] }[];
};

export type TAutoApprovalCatalogConstraint = {
  id: string;
  label: string;
  value: AutoApprovalConstraintValue;
  hasOptions: boolean;
};

export type TAutoApprovalCatalogSubject = {
  id: string;
  label: string;
  input: { label: string; placeholder: string } | null;
  constraints: TAutoApprovalCatalogConstraint[];
};

export type TAutoApprovalCatalogConnection = {
  id: string;
  name: string;
  app: string;
  subjects: TAutoApprovalCatalogSubject[];
};

export type TAutoApprovalOption = { value: string; label: string };

// A field the request form shows for one of the policy's inputs
export type TAutoApprovalInputDetails = {
  connectionId: string;
  connectionName: string;
  subject: string;
  label: string;
  placeholder: string;
};

export type TAutoApprovalInputValue = { connectionId: string; subject: string; value: string };

export type TAutoApprovalOutcome = {
  approvedAt: string | null;
  approvedByRuleId: string | null;
  inputs: { label: string; value: string; url: string | null }[];
  rules: {
    id: string;
    name: string;
    passed: boolean;
    conditions: { id: string; description: string; passed: boolean; reason: string | null }[];
  }[];
};

export type TAutoApprovalCatalog = {
  // Apps a connection can be created for to use in rules
  apps: AppConnection[];
  connections: TAutoApprovalCatalogConnection[];
};

export type TGetAutoApprovalCatalogDTO = {
  policyType: ApprovalPolicyType;
  scope: ApprovalPolicyScope;
  scopeId: string;
};

export type TListAutoApprovalOptionsDTO = TGetAutoApprovalCatalogDTO & {
  connectionId: string;
  subject: string;
  constraint: string;
  search?: string;
  siblings?: Record<string, string[]>;
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
  enforcementLevel: EnforcementLevel;
  bypassers: PolicyBypasser[];
  autoApproval?: TAutoApprovalConfigResponse;
  scopeType?: ApprovalPolicyScope | string | null;
  scopeId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TCreateApprovalPolicyDTO = {
  policyType: ApprovalPolicyType;
  scope: ApprovalPolicyScope;
  scopeId: string;
  name: string;
  maxRequestTtl?: string | null;
  conditions: PamAccessPolicyConditions | CertRequestPolicyConditions | CodeSigningPolicyConditions;
  constraints:
    | PamAccessPolicyConstraints
    | CertRequestPolicyConstraints
    | CodeSigningPolicyConstraints;
  steps: ApprovalPolicyStep[];
  bypassForMachineIdentities?: boolean;
  enforcementLevel?: EnforcementLevel;
  bypassers?: PolicyBypasser[];
  autoApproval?: TAutoApprovalConfig;
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
  enforcementLevel?: EnforcementLevel;
  bypassers?: PolicyBypasser[];
  autoApproval?: TAutoApprovalConfig;
};

export type TGetApprovalPolicyByIdDTO = {
  policyType: ApprovalPolicyType;
  policyId: string;
};

export type TListApprovalPoliciesDTO = {
  policyType: ApprovalPolicyType;
  scope: ApprovalPolicyScope;
  scopeId: string;
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
  constraints?: {
    accessDuration: { max: string };
  };
  autoApprovalInputs?: TAutoApprovalInputDetails[];
};
