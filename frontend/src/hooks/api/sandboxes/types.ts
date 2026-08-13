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

export enum SandboxCredentialRole {
  HeaderRewrite = "header-rewrite",
  Substitution = "substitution"
}

export enum SandboxSubstitutionSurface {
  Header = "header",
  Path = "path",
  Query = "query",
  Body = "body"
}

export type TSandboxCredentialConfig = {
  role: SandboxCredentialRole;
  headerName?: string;
  headerPrefix?: string;
  placeholderKey?: string;
  placeholderValue?: string;
  substitutionSurfaces?: SandboxSubstitutionSurface[];
};

export type TSandboxIntegration = {
  id: string;
  type: SandboxIntegrationType;
  hostnames: string[];
  secret: TSandboxSecretRef;
  credential: TSandboxCredentialConfig;
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
    role: SandboxCredentialRole;
    headerName: string;
    headerPrefix: string;
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
  slackChannelId: string | null;
  slackThreadTs: string | null;
};

export type TLinkSandboxSlackDTO = {
  sandboxId: string;
  /** Null unlinks the sandbox from Slack. */
  channelId: string | null;
  /** Scopes the link to one thread in that channel. Null means the whole channel. */
  threadTs: string | null;
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

export type TAgentMessage = {
  role: "user" | "assistant";
  content: string;
};

export type TAgentToolCall = {
  command: string;
  exitCode: number | null;
  output: string;
};

export type TAgentTurn = {
  reply: string;
  toolCalls: TAgentToolCall[];
};
