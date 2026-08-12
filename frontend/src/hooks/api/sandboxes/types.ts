export enum SandboxStatus {
  Stopped = "stopped",
  Running = "running"
}

export enum SandboxIntegrationType {
  GitHub = "github",
  Slack = "slack",
  Stripe = "stripe",
  Linear = "linear",
  OpenAI = "openai",
  Custom = "custom"
}

export enum SandboxAgentType {
  Gemini = "gemini",
  Claude = "claude",
  Codex = "codex",
  Copilot = "copilot"
}

export type TSandboxSecretRef = {
  projectId: string;
  environment: string;
  secretPath: string;
  secretKey: string;
};

export type TSandboxIntegration = {
  id: string;
  type: SandboxIntegrationType;
  hostnames: string[];
  secret: TSandboxSecretRef;
};

export type TSandboxGrants = {
  integrations: TSandboxIntegration[];
  pamAccountIds: string[];
};

export type TSandboxCatalog = {
  integrations: {
    type: SandboxIntegrationType;
    name: string;
    description: string;
    hostnames: string[];
    envVarName: string;
    cli: { name: string; binary: string } | null;
  }[];
  agents: {
    type: SandboxAgentType;
    name: string;
    tokenLabel: string;
    isSupported: boolean;
  }[];
};

export type TSandbox = {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  status: SandboxStatus;
  vcpu: number;
  memoryMb: number;
  grants: TSandboxGrants;
  agentType: SandboxAgentType | null;
  hasAgentToken: boolean;
  createdAt: string;
  lastActivityAt: string | null;
  commandsRun: number;
};

export type TSandboxExecResult = {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  cwd: string;
  wasTruncated: boolean;
  timedOut: boolean;
};

export type TCreateSandboxDTO = {
  name: string;
  description?: string;
  vcpu: number;
  memoryMb: number;
};

export type TUpdateSandboxDTO = {
  sandboxId: string;
  name?: string;
  description?: string;
  vcpu?: number;
  memoryMb?: number;
  pamAccountIds?: string[];
  agentType?: SandboxAgentType;
  agentToken?: string;
};
