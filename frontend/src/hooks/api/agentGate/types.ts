export type TPromptPolicy = {
  id: string;
  description: string;
  prompt: string;
  onActions: string[];
  enforce: "llm" | "log_only";
};

export type TSelfPolicies = {
  allowedActions: string[];
  promptPolicies: TPromptPolicy[];
};

export type TInboundPolicy = {
  fromAgentId?: string;
  allowedToRequest: string[];
  promptPolicies: TPromptPolicy[];
};

export type TAgentGatePolicy = {
  id: string;
  projectId: string;
  agentId: string;
  selfPolicies: TSelfPolicies;
  inboundPolicies: TInboundPolicy[];
  createdAt: string;
  updatedAt: string;
};

export type TListAgentGatePoliciesDTO = {
  projectId: string;
};

export type TGetAgentPolicyDTO = {
  agentId: string;
  projectId: string;
};

export type TUpdateAgentPolicyDTO = {
  agentId: string;
  projectId: string;
  selfPolicies?: TSelfPolicies;
  inboundPolicies?: TInboundPolicy[];
};
