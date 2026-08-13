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

export type TSandboxCatalogIntegration = {
  type: SandboxIntegrationType;
  name: string;
  description: string;
  hostnames: string[];
  envVarName: string;
  role: SandboxCredentialRole;
  headerName: string;
  headerPrefix: string;
  cli: { name: string; binary: string } | null;
};

export type TSandboxCatalog = {
  integrations: TSandboxCatalogIntegration[];
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
  agentModel: string | null;
  metrics: { cpuPercent: number; memoryMb: number; series: number[] } | null;
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
  agentModel?: string;
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

export enum SandboxCommandKind {
  Pam = "pam",
  Integration = "integration",
  Shell = "shell"
}

export enum SandboxCommandSource {
  Agent = "agent",
  Terminal = "terminal",
  Slack = "slack"
}

export enum SandboxActivityType {
  Command = "command",
  Proxy = "proxy"
}

export type TSandboxCommandEntry = {
  type: SandboxActivityType.Command;
  id: string;
  at: string;
  source: SandboxCommandSource;
  kind: SandboxCommandKind;
  command: string;
  exitCode: number | null;
  durationMs: number;
  target: string | null;
  accountId: string | null;
  resourceType: string | null;
};

export type TSandboxProxyEntry = {
  type: SandboxActivityType.Proxy;
  id: string;
  at: string;
  decision: string;
  method: string;
  host: string;
  path: string;
  status?: number;
  integration?: string;
  credential?: string;
};

export type TSandboxActivityEntry = TSandboxCommandEntry | TSandboxProxyEntry;

export type TSandboxMetrics = {
  cpuPercent: number;
  memoryMb: number;
  memoryLimitMb: number;
  networkInKb: number;
  networkOutKb: number;
  processes: number;
  isWorkloadRunning: boolean;
  samples: { at: number; cpuPercent: number; memoryMb: number; memoryLimitMb: number }[];
};

export type TSandboxProxyActivity = {
  at: string;
  decision: "brokered" | "blocked" | "error";
  method: string;
  host: string;
  path: string;
  status?: number;
  integration?: string;
  credential?: string;
};
