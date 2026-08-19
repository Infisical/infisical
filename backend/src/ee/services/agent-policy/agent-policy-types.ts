import { OrgServiceActor } from "@app/lib/types";

export type TAgentPolicyRuleInput = {
  hostPattern: string;
  methods: string[];
};

export type TAgentPolicyCredentialInput = {
  slotKey: string;
  environment: string;
  secretPath: string;
  secretKey: string;
};

export type TCreateAgentPolicyDTO = {
  projectId: string;
  name: string;
  target: string;
  identityIds: string[];
  credentials: TAgentPolicyCredentialInput[];
  rules: TAgentPolicyRuleInput[];
};

export type TUpdateAgentPolicyDTO = {
  policyId: string;
  name?: string;
  identityIds?: string[];
  credentials?: TAgentPolicyCredentialInput[];
  rules?: TAgentPolicyRuleInput[];
};

export type TListAgentPoliciesDTO = {
  projectId: string;
};

export type TAgentPolicyByIdDTO = {
  policyId: string;
};

export type TAgentPolicyActor = {
  actor: OrgServiceActor;
};
