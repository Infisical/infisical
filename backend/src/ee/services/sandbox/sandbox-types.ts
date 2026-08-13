import {
  SandboxAgentType,
  SandboxCredentialRole,
  SandboxIntegrationType,
  SandboxSubstitutionSurface
} from "./sandbox-integrations";

export enum SandboxStatus {
  Stopped = "stopped",
  Running = "running"
}

/** Where an integration's credential comes from in Secrets Manager. */
export type TSandboxSecretRef = {
  projectId: string;
  environment: string;
  secretPath: string;
  secretKey: string;
};

/** How the broker applies the secret, mirroring the Agent Proxy's two credential roles. */
export type TSandboxCredentialConfig = {
  role: SandboxCredentialRole;
  /** Header rewrite: the header set upstream and the prefix the secret sits behind. */
  headerName?: string;
  headerPrefix?: string;
  /** Substitution: the placeholder the agent holds, and where it is swapped. */
  placeholderKey?: string;
  placeholderValue?: string;
  substitutionSurfaces?: SandboxSubstitutionSurface[];
};

export type TSandboxIntegration = {
  id: string;
  type: SandboxIntegrationType;
  /** Resolved at write time: from the catalog for known types, from the user for Custom. */
  hostnames: string[];
  secret: TSandboxSecretRef;
  credential: TSandboxCredentialConfig;
};

/**
 * What the sandbox is allowed to reach. Integrations are brokered over HTTP by the sandbox's own
 * reverse proxy; PAM accounts are handed to the agent as context.
 */
export type TSandboxGrants = {
  integrations: TSandboxIntegration[];
  pamAccountIds: string[];
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
  /** Null means the agent's own default model. */
  agentModel: string | null;
  /** The token itself is never returned, only whether one is configured. */
  hasAgentToken: boolean;
  createdAt: string;
  lastActivityAt: string | null;
  commandsRun: number;
  slackChannelId: string | null;
  slackThreadTs: string | null;
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

export type TSandboxIntegrationInput = {
  type: SandboxIntegrationType;
  /** Required for Custom, ignored otherwise: the catalog supplies these for known types. */
  hostnames?: string[];
  credential?: TSandboxCredentialConfig;
  secret: TSandboxSecretRef;
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

export type TSandboxIdDTO = {
  sandboxId: string;
};

export type TAddSandboxIntegrationDTO = TSandboxIdDTO & {
  integration: TSandboxIntegrationInput;
};

export type TRemoveSandboxIntegrationDTO = TSandboxIdDTO & {
  integrationId: string;
};

export type TExecInSandboxDTO = {
  sandboxId: string;
  command: string;
};

/**
 * Boot progress for the creation wizard's console. `step` marks a named phase the UI can tick off;
 * `log` is a line of detail underneath it. Reported as the start actually happens rather than being
 * a timed animation, so a slow pull or a failed grant is visible instead of hidden behind a spinner.
 */
export type TSandboxBootEvent =
  | { type: "step"; label: string; message: string }
  | { type: "log"; message: string }
  | { type: "ready" }
  | { type: "error"; message: string };

export type TSandboxBootSink = (event: TSandboxBootEvent) => void;
