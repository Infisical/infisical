import { AgentVaultCredentialType } from "@app/hooks/api/agentVault";

// Copied from the proxied-services catalog rather than imported: that module has to stay
// independently deletable, and Agent Vault's grammar rejects the paths and bare tenant wildcards
// several of its entries carry. Templates are a frontend convenience only. The backend never
// learns a service name, which is what stopped App Connections' enum from growing to 114 members.
export enum AgentVaultTemplateCategory {
  Llm = "LLM Providers",
  DeveloperTools = "Developer Tools",
  Communication = "Communication",
  Monitoring = "Monitoring",
  Productivity = "Productivity",
  Payments = "Payments",
  Commerce = "Commerce"
}

export type AgentVaultTemplateCredential =
  | { type: AgentVaultCredentialType.Bearer; headerName?: string; headerPrefix?: string }
  | { type: AgentVaultCredentialType.Basic }
  | { type: AgentVaultCredentialType.Passthrough };

export type AgentVaultTemplate = {
  key: string;
  name: string;
  image: string;
  category: AgentVaultTemplateCategory;
  description: string;
  hostPattern: string;
  aliases?: string[];
  // Stated plainly where a template is broader than its name suggests, or where a placeholder has
  // to be replaced before the pattern will validate.
  caveat?: string;
  credential: AgentVaultTemplateCredential;
};

export const AGENT_VAULT_TEMPLATES: AgentVaultTemplate[] = [
  {
    key: "openai",
    name: "OpenAI",
    image: "OpenAI.png",
    category: AgentVaultTemplateCategory.Llm,
    description: "Chat and models from OpenAI.",
    hostPattern: "api.openai.com",
    aliases: ["gpt", "chatgpt"],
    credential: { type: AgentVaultCredentialType.Bearer }
  },
  {
    key: "anthropic",
    name: "Anthropic",
    image: "Anthropic.png",
    category: AgentVaultTemplateCategory.Llm,
    description: "Claude models from Anthropic.",
    hostPattern: "api.anthropic.com",
    aliases: ["claude"],
    credential: { type: AgentVaultCredentialType.Bearer }
  },
  {
    key: "gemini",
    name: "Google Gemini",
    image: "Gemini.svg",
    category: AgentVaultTemplateCategory.Llm,
    description: "Google's Gemini models.",
    hostPattern: "generativelanguage.googleapis.com",
    aliases: ["google", "bard", "vertex"],
    credential: { type: AgentVaultCredentialType.Bearer }
  },
  {
    key: "mistral",
    name: "Mistral AI",
    image: "Mistral.svg",
    category: AgentVaultTemplateCategory.Llm,
    description: "Chat and embedding models from Mistral.",
    hostPattern: "api.mistral.ai",
    credential: { type: AgentVaultCredentialType.Bearer }
  },
  {
    key: "cohere",
    name: "Cohere",
    image: "Cohere.svg",
    category: AgentVaultTemplateCategory.Llm,
    description: "Cohere's language models.",
    hostPattern: "api.cohere.com",
    credential: { type: AgentVaultCredentialType.Bearer }
  },
  {
    key: "groq",
    name: "Groq",
    image: "Groq.svg",
    category: AgentVaultTemplateCategory.Llm,
    description: "Fast model inference from Groq.",
    hostPattern: "api.groq.com",
    credential: { type: AgentVaultCredentialType.Bearer }
  },
  {
    key: "perplexity",
    name: "Perplexity",
    image: "Perplexity.svg",
    category: AgentVaultTemplateCategory.Llm,
    description: "Perplexity's answer engine.",
    hostPattern: "api.perplexity.ai",
    credential: { type: AgentVaultCredentialType.Bearer }
  },
  {
    key: "openrouter",
    name: "OpenRouter",
    image: "OpenRouter.png",
    category: AgentVaultTemplateCategory.Llm,
    description: "One key for many AI models.",
    hostPattern: "openrouter.ai",
    credential: { type: AgentVaultCredentialType.Bearer }
  },
  {
    key: "together",
    name: "Together AI",
    image: "Together.svg",
    category: AgentVaultTemplateCategory.Llm,
    description: "Open models on Together AI.",
    hostPattern: "api.together.ai, api.together.xyz",
    credential: { type: AgentVaultCredentialType.Bearer }
  },
  {
    key: "deepseek",
    name: "DeepSeek",
    image: "DeepSeek.svg",
    category: AgentVaultTemplateCategory.Llm,
    description: "DeepSeek's chat and reasoning models.",
    hostPattern: "api.deepseek.com",
    credential: { type: AgentVaultCredentialType.Bearer }
  },
  {
    key: "xai",
    name: "xAI (Grok)",
    image: "xAI.svg",
    category: AgentVaultTemplateCategory.Llm,
    description: "Grok models from xAI.",
    hostPattern: "api.x.ai",
    aliases: ["grok"],
    credential: { type: AgentVaultCredentialType.Bearer }
  },
  {
    key: "fireworks",
    name: "Fireworks AI",
    image: "Fireworks.png",
    category: AgentVaultTemplateCategory.Llm,
    description: "Fast open-model inference.",
    hostPattern: "api.fireworks.ai",
    credential: { type: AgentVaultCredentialType.Bearer }
  },
  {
    key: "stripe",
    name: "Stripe",
    image: "Stripe.svg",
    category: AgentVaultTemplateCategory.Payments,
    description: "Payments and billing.",
    hostPattern: "api.stripe.com",
    credential: { type: AgentVaultCredentialType.Bearer }
  },
  {
    key: "twilio",
    name: "Twilio",
    image: "Twilio.svg",
    category: AgentVaultTemplateCategory.Communication,
    description: "SMS, voice, and messaging.",
    hostPattern: "api.twilio.com",
    credential: { type: AgentVaultCredentialType.Basic }
  },
  {
    key: "sendgrid",
    name: "SendGrid",
    image: "SendGrid.png",
    category: AgentVaultTemplateCategory.Communication,
    description: "Send transactional email.",
    hostPattern: "api.sendgrid.com",
    credential: { type: AgentVaultCredentialType.Bearer }
  },
  {
    key: "resend",
    name: "Resend",
    image: "Resend.svg",
    category: AgentVaultTemplateCategory.Communication,
    description: "Email built for developers.",
    hostPattern: "api.resend.com",
    credential: { type: AgentVaultCredentialType.Bearer }
  },
  {
    key: "slack",
    name: "Slack",
    image: "Slack.svg",
    category: AgentVaultTemplateCategory.Communication,
    description: "Post messages and build Slack apps.",
    hostPattern: "slack.com",
    credential: { type: AgentVaultCredentialType.Bearer }
  },
  {
    key: "telegram",
    name: "Telegram",
    image: "Telegram.svg",
    category: AgentVaultTemplateCategory.Communication,
    description: "Build and run Telegram bots.",
    hostPattern: "api.telegram.org",
    credential: { type: AgentVaultCredentialType.Bearer }
  },
  {
    key: "discord",
    name: "Discord",
    image: "Discord.svg",
    category: AgentVaultTemplateCategory.Communication,
    description: "Build and run Discord bots.",
    hostPattern: "discord.com",
    credential: {
      type: AgentVaultCredentialType.Bearer,
      headerName: "Authorization",
      headerPrefix: "Bot"
    }
  },
  {
    key: "github",
    name: "GitHub",
    image: "GitHub.png",
    category: AgentVaultTemplateCategory.DeveloperTools,
    description: "Repos, issues, and more on GitHub.",
    hostPattern: "api.github.com",
    credential: { type: AgentVaultCredentialType.Bearer }
  },
  {
    key: "gitlab",
    name: "GitLab",
    image: "GitLab.png",
    category: AgentVaultTemplateCategory.DeveloperTools,
    description: "Repos and pipelines on GitLab.",
    hostPattern: "gitlab.com",
    credential: {
      type: AgentVaultCredentialType.Bearer,
      headerName: "PRIVATE-TOKEN",
      headerPrefix: ""
    }
  },
  {
    key: "vercel",
    name: "Vercel",
    image: "Vercel.png",
    category: AgentVaultTemplateCategory.DeveloperTools,
    description: "Deploys and the Vercel API.",
    hostPattern: "api.vercel.com",
    credential: { type: AgentVaultCredentialType.Bearer }
  },
  {
    key: "cloudflare",
    name: "Cloudflare",
    image: "Cloudflare.png",
    category: AgentVaultTemplateCategory.DeveloperTools,
    description: "DNS, CDN, and the Cloudflare API.",
    hostPattern: "api.cloudflare.com",
    credential: { type: AgentVaultCredentialType.Bearer }
  },
  {
    key: "supabase",
    name: "Supabase",
    image: "Supabase.png",
    category: AgentVaultTemplateCategory.DeveloperTools,
    description: "Postgres, auth, and storage.",
    hostPattern: "<your-project>.supabase.co",
    caveat:
      "Replace the placeholder with your own project subdomain. A wildcard here would send the key to any Supabase tenant.",
    credential: {
      type: AgentVaultCredentialType.Bearer,
      headerName: "apikey",
      headerPrefix: ""
    }
  },
  {
    key: "npm",
    name: "npm",
    image: "NPM.svg",
    category: AgentVaultTemplateCategory.DeveloperTools,
    description: "The npm package registry.",
    hostPattern: "registry.npmjs.org",
    credential: { type: AgentVaultCredentialType.Bearer }
  },
  {
    key: "github-npm",
    name: "GitHub Packages",
    image: "GitHub.png",
    category: AgentVaultTemplateCategory.DeveloperTools,
    description: "GitHub's npm package registry.",
    hostPattern: "npm.pkg.github.com",
    aliases: ["npm", "packages"],
    credential: { type: AgentVaultCredentialType.Bearer }
  },
  {
    key: "datadog",
    name: "Datadog",
    image: "Datadog.png",
    category: AgentVaultTemplateCategory.Monitoring,
    description: "Monitoring and analytics.",
    hostPattern: "api.datadoghq.com",
    credential: {
      type: AgentVaultCredentialType.Bearer,
      headerName: "DD-API-KEY",
      headerPrefix: ""
    }
  },
  {
    key: "sentry",
    name: "Sentry",
    image: "Sentry.svg",
    category: AgentVaultTemplateCategory.Monitoring,
    description: "Error and performance monitoring.",
    hostPattern: "sentry.io",
    credential: { type: AgentVaultCredentialType.Bearer }
  },
  {
    key: "pagerduty",
    name: "PagerDuty",
    image: "PagerDuty.svg",
    category: AgentVaultTemplateCategory.Monitoring,
    description: "On-call and incident management.",
    hostPattern: "api.pagerduty.com",
    credential: { type: AgentVaultCredentialType.Bearer }
  },
  {
    key: "linear",
    name: "Linear",
    image: "Linear.svg",
    category: AgentVaultTemplateCategory.Productivity,
    description: "Issue tracking and project management.",
    hostPattern: "api.linear.app",
    credential: {
      type: AgentVaultCredentialType.Bearer,
      headerName: "Authorization",
      headerPrefix: ""
    }
  },
  {
    key: "notion",
    name: "Notion",
    image: "Notion.svg",
    category: AgentVaultTemplateCategory.Productivity,
    description: "Notion workspace and docs.",
    hostPattern: "api.notion.com",
    credential: { type: AgentVaultCredentialType.Bearer }
  },
  {
    key: "jira",
    name: "Jira",
    image: "Jira.svg",
    category: AgentVaultTemplateCategory.Productivity,
    description: "Atlassian Jira issue tracking.",
    hostPattern: "<your-tenant>.atlassian.net",
    caveat:
      "Replace the placeholder with your own Atlassian subdomain. A wildcard here would send the credential to any tenant.",
    credential: { type: AgentVaultCredentialType.Basic }
  },
  {
    key: "google-workspace",
    name: "Google Workspace",
    image: "Google Workspace.svg",
    category: AgentVaultTemplateCategory.Productivity,
    description: "Gmail, Calendar, Sheets, and Drive.",
    hostPattern: "gmail.googleapis.com, sheets.googleapis.com, www.googleapis.com",
    aliases: ["workspace", "gsuite", "gmail", "calendar", "sheets", "drive", "gdrive"],
    caveat: "www.googleapis.com covers every Google API, not just Calendar and Drive.",
    credential: { type: AgentVaultCredentialType.Bearer }
  },
  {
    key: "postmark",
    name: "Postmark",
    image: "Postmark.png",
    category: AgentVaultTemplateCategory.Communication,
    description: "Transactional email.",
    hostPattern: "api.postmarkapp.com",
    credential: {
      type: AgentVaultCredentialType.Bearer,
      headerName: "X-Postmark-Server-Token",
      headerPrefix: ""
    }
  },
  {
    key: "shopify",
    name: "Shopify",
    image: "Shopify.svg",
    category: AgentVaultTemplateCategory.Commerce,
    description: "Shopify e-commerce API.",
    hostPattern: "<your-store>.myshopify.com",
    caveat:
      "Replace the placeholder with your own store subdomain. A wildcard here would send the token to any store.",
    credential: {
      type: AgentVaultCredentialType.Bearer,
      headerName: "X-Shopify-Access-Token",
      headerPrefix: ""
    }
  }
];

export const POPULAR_AGENT_VAULT_TEMPLATES = [
  "openai",
  "anthropic",
  "github",
  "slack",
  "google-workspace"
];

const stripPort = (pattern: string) => pattern.split(":")[0];

const hostMatchesTemplateHost = (host: string, templateHost: string) => {
  if (!templateHost.startsWith("*.")) return host === templateHost;
  // A wildcard is the leftmost label and matches exactly one label, matching the backend grammar.
  const suffix = templateHost.slice(2);
  if (!host.endsWith(`.${suffix}`)) return false;
  return !host.slice(0, host.length - suffix.length - 1).includes(".");
};

// Icons and names on the bundle and connection rows are re-derived from the stored host pattern.
// Template choice is never persisted, so a connection edited by hand stays consistent.
export const findTemplateForHostPattern = (hostPattern: string): AgentVaultTemplate | undefined => {
  const hosts = hostPattern
    .split(",")
    .map((entry) => stripPort(entry.trim()))
    .filter(Boolean);

  return AGENT_VAULT_TEMPLATES.find((template) =>
    template.hostPattern
      .split(",")
      .map((entry) => stripPort(entry.trim()))
      .some((templateHost) => hosts.some((host) => hostMatchesTemplateHost(host, templateHost)))
  );
};
