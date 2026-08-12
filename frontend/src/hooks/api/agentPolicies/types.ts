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

export enum AgentPolicyCredentialRole {
  HeaderRewrite = "header-rewrite",
  CredentialSubstitution = "credential-substitution"
}

export type TAgentPolicyCredential = {
  id: string;
  slotKey: string;
  environment: string;
  secretPath: string;
  secretKey: string;
  role: AgentPolicyCredentialRole;
  headerName: string | null;
  headerPrefix: string | null;
  headerPurpose: string | null;
  // The decoy the agent holds in its environment. Null for a header-rewrite credential, where the agent
  // sends nothing and the proxy adds the header itself.
  placeholderKey: string | null;
  placeholderValue: string | null;
  substitutionSurfaces: string[];
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
