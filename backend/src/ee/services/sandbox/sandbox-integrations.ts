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

export type TSandboxAgentDefinition = {
  type: SandboxAgentType;
  name: string;
  tokenLabel: string;
  isSupported: boolean;
};

/** Only Gemini runs today. The rest are listed so the selector shows the intended shape. */
export const SANDBOX_AGENTS: TSandboxAgentDefinition[] = [
  { type: SandboxAgentType.Gemini, name: "Gemini", tokenLabel: "Gemini API key", isSupported: true },
  { type: SandboxAgentType.Claude, name: "Claude Code", tokenLabel: "Anthropic API key", isSupported: false },
  { type: SandboxAgentType.Codex, name: "Codex", tokenLabel: "OpenAI API key", isSupported: false },
  { type: SandboxAgentType.Copilot, name: "GitHub Copilot", tokenLabel: "GitHub token", isSupported: false }
];

/**
 * Mirrors the Agent Proxy's credential model (see ee/services/proxied-service): a credential is
 * either rewritten into a header on the way out, or substituted for a placeholder the agent holds.
 */
export enum SandboxCredentialRole {
  HeaderRewrite = "header-rewrite",
  Substitution = "substitution"
}

/** The request surfaces scanned for the placeholder. Scoping these is the security boundary. */
export enum SandboxSubstitutionSurface {
  Header = "header",
  Path = "path",
  Query = "query",
  Body = "body"
}

export type TSandboxIntegrationDefinition = {
  type: SandboxIntegrationType;
  name: string;
  description: string;
  /** Host patterns the broker matches, `host[:port][/path]` with `*.` wildcards. Empty for Custom. */
  hostnames: string[];
  /** Env var the sandbox receives holding a placeholder, never the real value. */
  envVarName: string;
  role: SandboxCredentialRole;
  /** Header rewritten upstream, and the prefix the secret is formatted behind. */
  headerName: string;
  headerPrefix: string;
  /** CLI dropped into the sandbox's own bin/ when the integration is added. */
  cli: { name: string; binary: string } | null;
  /** Handed to the agent so it knows what it can call and how. */
  agentContext: string;
};

export const SANDBOX_INTEGRATIONS: Record<SandboxIntegrationType, TSandboxIntegrationDefinition> = {
  [SandboxIntegrationType.GitHub]: {
    type: SandboxIntegrationType.GitHub,
    name: "GitHub",
    description: "REST and GraphQL APIs, plus the gh CLI.",
    hostnames: ["api.github.com", "github.com", "uploads.github.com"],
    envVarName: "GH_TOKEN",
    role: SandboxCredentialRole.HeaderRewrite,
    headerName: "Authorization",
    headerPrefix: "Bearer",
    cli: { name: "gh", binary: "gh" },
    agentContext:
      "GitHub is available. Use the `gh` CLI or call https://api.github.com directly. Authentication is already handled: never ask for or print a token."
  },
  [SandboxIntegrationType.Slack]: {
    type: SandboxIntegrationType.Slack,
    name: "Slack",
    description: "Web API for posting messages and reading channels.",
    hostnames: ["slack.com", "api.slack.com"],
    envVarName: "SLACK_TOKEN",
    role: SandboxCredentialRole.HeaderRewrite,
    headerName: "Authorization",
    headerPrefix: "Bearer",
    cli: null,
    agentContext:
      "Slack is available at https://slack.com/api. Use chat.postMessage to post. Authentication is already handled: never ask for or print a token."
  },
  [SandboxIntegrationType.Stripe]: {
    type: SandboxIntegrationType.Stripe,
    name: "Stripe",
    description: "Read customers, charges and subscriptions.",
    hostnames: ["api.stripe.com"],
    envVarName: "STRIPE_API_KEY",
    role: SandboxCredentialRole.HeaderRewrite,
    headerName: "Authorization",
    headerPrefix: "Bearer",
    cli: null,
    agentContext:
      "Stripe is available at https://api.stripe.com. Authentication is already handled: never ask for or print a key."
  },
  [SandboxIntegrationType.Linear]: {
    type: SandboxIntegrationType.Linear,
    name: "Linear",
    description: "GraphQL API for issues and projects.",
    hostnames: ["api.linear.app"],
    envVarName: "LINEAR_API_KEY",
    role: SandboxCredentialRole.HeaderRewrite,
    headerName: "Authorization",
    headerPrefix: "",
    cli: null,
    agentContext:
      "Linear's GraphQL API is available at https://api.linear.app/graphql. Authentication is already handled."
  },
  [SandboxIntegrationType.OpenAI]: {
    type: SandboxIntegrationType.OpenAI,
    name: "OpenAI",
    description: "Chat completions and embeddings.",
    hostnames: ["api.openai.com"],
    envVarName: "OPENAI_API_KEY",
    role: SandboxCredentialRole.HeaderRewrite,
    headerName: "Authorization",
    headerPrefix: "Bearer",
    cli: null,
    agentContext:
      "OpenAI is available at https://api.openai.com. Authentication is already handled: never ask for or print a key."
  },
  [SandboxIntegrationType.Custom]: {
    type: SandboxIntegrationType.Custom,
    name: "Custom endpoint",
    description: "Your own hostnames, authenticated with a secret you choose.",
    hostnames: [],
    envVarName: "CUSTOM_API_TOKEN",
    role: SandboxCredentialRole.HeaderRewrite,
    headerName: "Authorization",
    headerPrefix: "Bearer",
    cli: null,
    agentContext: "A custom endpoint is available. Authentication is already handled."
  }
};

export const listSandboxIntegrations = () => Object.values(SANDBOX_INTEGRATIONS);
