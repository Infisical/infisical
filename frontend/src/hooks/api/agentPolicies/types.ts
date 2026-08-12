export enum PolicyRuleMethod {
  Get = "GET",
  Post = "POST",
  Put = "PUT",
  Patch = "PATCH",
  Delete = "DELETE",
  Head = "HEAD",
  Options = "OPTIONS"
}

export type TPolicyRule = {
  id: string;
  hostPattern: string;
  // Empty means every method, which the UI shows as "Any".
  methods: PolicyRuleMethod[];
};

export type TPolicyRuleInput = {
  hostPattern: string;
  methods: PolicyRuleMethod[];
};

export type TAgentPolicyAgent = {
  identityId: string;
  name: string;
};

export type TAgentPolicyCredential = {
  id: string;
  slotKey: string;
  environment: string;
  secretPath: string;
  secretKey: string;
};

export type TAgentPolicyCredentialInput = {
  slotKey: string;
  environment: string;
  secretPath: string;
  secretKey: string;
};

export type TAgentPolicy = {
  id: string;
  projectId: string;
  name: string;
  target: string;
  createdAt: string;
  updatedAt: string;
  agents: TAgentPolicyAgent[];
  rules: TPolicyRule[];
  credentials: TAgentPolicyCredential[];
};

export type TAgentPolicyTarget = {
  key: string;
  credentials: { slotKey: string; label: string }[];
  defaultRules: { hostPattern: string; methods: PolicyRuleMethod[] }[];
};

export type TCreateAgentPolicyDTO = {
  projectId: string;
  name: string;
  target: string;
  identityIds: string[];
  credentials: TAgentPolicyCredentialInput[];
  rules: TPolicyRuleInput[];
};

export type TUpdateAgentPolicyDTO = {
  policyId: string;
  projectId: string;
  name?: string;
  identityIds?: string[];
  credentials?: TAgentPolicyCredentialInput[];
  rules?: TPolicyRuleInput[];
};
