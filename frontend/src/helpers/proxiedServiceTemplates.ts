import { ProxiedServiceSubstitutionSurface } from "@app/hooks/api/proxiedServices/enums";

export enum ProxiedServiceTemplateCategory {
  Llm = "LLM Providers",
  DeveloperTools = "Developer Tools",
  Communication = "Communication",
  Monitoring = "Monitoring",
  Productivity = "Productivity",
  Payments = "Payments",
  Commerce = "Commerce"
}

export type ProxiedServiceTemplateHeaderSeed = {
  headerName: string;
  headerPrefix?: string;
};

export type ProxiedServiceTemplateSubstitutionSeed = {
  placeholderKey: string;
  surfaces: ProxiedServiceSubstitutionSurface[];
  generatePlaceholder: () => string;
};

export type ProxiedServiceTemplate = {
  key: string;
  name: string;
  image: string;
  category: ProxiedServiceTemplateCategory;
  description: string;
  hostPattern: string;
  defaultName?: string;
  aliases?: string[];
  seed: {
    // Substitution-only templates leave `headers` undefined; the form builder treats
    // that as an explicit empty header list so the legacy Authorization row is dropped.
    headers?: ProxiedServiceTemplateHeaderSeed[];
    basicAuth?: { withPassword?: boolean };
    substitutions?: ProxiedServiceTemplateSubstitutionSeed[];
  };
};

const ALPHANUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const BASE64URL = `${ALPHANUM}-_`;
const HEX = "0123456789abcdef";
const DIGITS = "0123456789";

const UPPERALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

const randomToken = (length: number, alphabet: string = ALPHANUM) =>
  Array.from({ length }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");

// Slack accepts its tokens only in the Authorization header or a POST body param — never in
// the query string or path — so scope substitution to those two surfaces.
const HEADER_AND_BODY = [
  ProxiedServiceSubstitutionSurface.Header,
  ProxiedServiceSubstitutionSurface.Body
];

const bearer = (
  headerName = "Authorization",
  headerPrefix = "Bearer"
): ProxiedServiceTemplateHeaderSeed[] => [{ headerName, headerPrefix }];

// A substitution on the Authorization header: the agent's SDK sees a real-looking key and
// makes the request; the proxy swaps the placeholder for the real secret on the wire.
const bearerSubstitution = (
  placeholderKey: string,
  generatePlaceholder: () => string,
  surfaces: ProxiedServiceSubstitutionSurface[] = [ProxiedServiceSubstitutionSurface.Header]
): ProxiedServiceTemplateSubstitutionSeed[] => [{ placeholderKey, surfaces, generatePlaceholder }];

export const PROXIED_SERVICE_TEMPLATES: ProxiedServiceTemplate[] = [
  // ---- LLM Providers ----
  {
    key: "openai",
    name: "OpenAI",
    image: "OpenAI.png",
    category: ProxiedServiceTemplateCategory.Llm,
    description: "Chat and models from OpenAI.",
    hostPattern: "api.openai.com",
    aliases: ["gpt", "chatgpt"],
    seed: {
      substitutions: bearerSubstitution("OPENAI_API_KEY", () => `sk-proj-${randomToken(48)}`)
    }
  },
  {
    key: "anthropic",
    name: "Anthropic",
    image: "Anthropic.png",
    category: ProxiedServiceTemplateCategory.Llm,
    description: "Claude models from Anthropic.",
    hostPattern: "api.anthropic.com",
    aliases: ["claude"],
    seed: {
      substitutions: bearerSubstitution(
        "ANTHROPIC_API_KEY",
        () => `sk-ant-api03-${randomToken(93, BASE64URL)}AA`
      )
    }
  },
  {
    key: "gemini",
    name: "Google Gemini",
    image: "Gemini.svg",
    category: ProxiedServiceTemplateCategory.Llm,
    description: "Google's Gemini models.",
    hostPattern: "generativelanguage.googleapis.com",
    aliases: ["google", "bard", "vertex"],
    seed: {
      substitutions: bearerSubstitution("GEMINI_API_KEY", () => `AIza${randomToken(35)}`, [
        ProxiedServiceSubstitutionSurface.Query,
        ProxiedServiceSubstitutionSurface.Header
      ])
    }
  },
  {
    key: "mistral",
    name: "Mistral AI",
    image: "Mistral.svg",
    category: ProxiedServiceTemplateCategory.Llm,
    description: "Chat and embedding models from Mistral.",
    hostPattern: "api.mistral.ai",
    seed: {
      substitutions: bearerSubstitution("MISTRAL_API_KEY", () => randomToken(32))
    }
  },
  {
    key: "cohere",
    name: "Cohere",
    image: "Cohere.svg",
    category: ProxiedServiceTemplateCategory.Llm,
    description: "Cohere's language models.",
    hostPattern: "api.cohere.com",
    seed: {
      substitutions: bearerSubstitution("CO_API_KEY", () => randomToken(40))
    }
  },
  {
    key: "groq",
    name: "Groq",
    image: "Groq.svg",
    category: ProxiedServiceTemplateCategory.Llm,
    description: "Fast model inference from Groq.",
    hostPattern: "api.groq.com",
    seed: {
      substitutions: bearerSubstitution("GROQ_API_KEY", () => `gsk_${randomToken(52)}`)
    }
  },
  {
    key: "perplexity",
    name: "Perplexity",
    image: "Perplexity.svg",
    category: ProxiedServiceTemplateCategory.Llm,
    description: "Perplexity's answer engine.",
    hostPattern: "api.perplexity.ai",
    seed: {
      substitutions: bearerSubstitution("PERPLEXITY_API_KEY", () => `pplx-${randomToken(48)}`)
    }
  },
  {
    key: "openrouter",
    name: "OpenRouter",
    image: "OpenRouter.png",
    category: ProxiedServiceTemplateCategory.Llm,
    description: "One key for many AI models.",
    hostPattern: "openrouter.ai",
    seed: {
      substitutions: bearerSubstitution(
        "OPENROUTER_API_KEY",
        () => `sk-or-v1-${randomToken(64, HEX)}`
      )
    }
  },
  {
    key: "together",
    name: "Together AI",
    image: "Together.svg",
    category: ProxiedServiceTemplateCategory.Llm,
    description: "Open models on Together AI.",
    hostPattern: "api.together.ai, api.together.xyz",
    seed: {
      substitutions: bearerSubstitution("TOGETHER_API_KEY", () => randomToken(64, HEX))
    }
  },
  {
    key: "deepseek",
    name: "DeepSeek",
    image: "DeepSeek.svg",
    category: ProxiedServiceTemplateCategory.Llm,
    description: "DeepSeek's chat and reasoning models.",
    hostPattern: "api.deepseek.com",
    seed: {
      substitutions: bearerSubstitution("DEEPSEEK_API_KEY", () => `sk-${randomToken(32)}`)
    }
  },
  {
    key: "xai",
    name: "xAI (Grok)",
    image: "xAI.svg",
    category: ProxiedServiceTemplateCategory.Llm,
    description: "Grok models from xAI.",
    hostPattern: "api.x.ai",
    aliases: ["grok"],
    seed: {
      substitutions: bearerSubstitution("XAI_API_KEY", () => `xai-${randomToken(80)}`)
    }
  },
  {
    key: "fireworks",
    name: "Fireworks AI",
    image: "Fireworks.png",
    category: ProxiedServiceTemplateCategory.Llm,
    description: "Fast open-model inference.",
    hostPattern: "api.fireworks.ai",
    seed: {
      substitutions: bearerSubstitution("FIREWORKS_API_KEY", () => `fw_${randomToken(24)}`)
    }
  },

  // ---- Payments ----
  {
    key: "stripe",
    name: "Stripe",
    image: "Stripe.svg",
    category: ProxiedServiceTemplateCategory.Payments,
    description: "Payments and billing.",
    hostPattern: "api.stripe.com",
    defaultName: "stripe-api",
    seed: {
      substitutions: bearerSubstitution("STRIPE_SECRET_KEY", () => `sk_live_${randomToken(24)}`)
    }
  },

  // ---- Communication ----
  {
    key: "twilio",
    name: "Twilio",
    image: "Twilio.svg",
    category: ProxiedServiceTemplateCategory.Communication,
    description: "SMS, voice, and messaging.",
    hostPattern: "api.twilio.com",
    seed: {
      basicAuth: { withPassword: true }
    }
  },
  {
    key: "sendgrid",
    name: "SendGrid",
    image: "SendGrid.png",
    category: ProxiedServiceTemplateCategory.Communication,
    description: "Send transactional email.",
    hostPattern: "api.sendgrid.com",
    seed: {
      substitutions: bearerSubstitution(
        "SENDGRID_API_KEY",
        () => `SG.${randomToken(22)}.${randomToken(43, BASE64URL)}`
      )
    }
  },
  {
    key: "resend",
    name: "Resend",
    image: "Resend.svg",
    category: ProxiedServiceTemplateCategory.Communication,
    description: "Email built for developers.",
    hostPattern: "api.resend.com",
    seed: {
      substitutions: bearerSubstitution("RESEND_API_KEY", () => `re_${randomToken(24)}`)
    }
  },
  {
    key: "slack",
    name: "Slack",
    image: "Slack.svg",
    category: ProxiedServiceTemplateCategory.Communication,
    description: "Post messages and build Slack apps.",
    hostPattern: "slack.com",
    // Slack needs both the app-level and bot tokens brokered across every surface.
    seed: {
      substitutions: [
        {
          placeholderKey: "SLACK_APP_TOKEN",
          surfaces: HEADER_AND_BODY,
          generatePlaceholder: () =>
            `xapp-1-A0${randomToken(9, UPPERALNUM)}-${randomToken(13, DIGITS)}-${randomToken(64, HEX)}`
        },
        {
          placeholderKey: "SLACK_BOT_TOKEN",
          surfaces: HEADER_AND_BODY,
          generatePlaceholder: () =>
            `xoxb-${randomToken(11, DIGITS)}-${randomToken(13, DIGITS)}-${randomToken(24)}`
        }
      ]
    }
  },
  {
    key: "telegram",
    name: "Telegram",
    image: "Telegram.svg",
    category: ProxiedServiceTemplateCategory.Communication,
    description: "Build and run Telegram bots.",
    hostPattern: "api.telegram.org",
    defaultName: "telegram-bot-api",
    seed: {
      substitutions: bearerSubstitution(
        "TELEGRAM_BOT_TOKEN",
        () => `${randomToken(10, DIGITS)}:${randomToken(35, BASE64URL)}`,
        [ProxiedServiceSubstitutionSurface.Path]
      )
    }
  },
  {
    key: "discord",
    name: "Discord",
    image: "Discord.svg",
    category: ProxiedServiceTemplateCategory.Communication,
    description: "Build and run Discord bots.",
    hostPattern: "discord.com/api/*",
    seed: {
      headers: bearer("Authorization", "Bot")
    }
  },

  // ---- Developer Tools ----
  {
    key: "github",
    name: "GitHub",
    image: "GitHub.png",
    category: ProxiedServiceTemplateCategory.DeveloperTools,
    description: "Repos, issues, and more on GitHub.",
    hostPattern: "api.github.com",
    seed: {
      substitutions: bearerSubstitution("GITHUB_TOKEN", () => `ghp_${randomToken(36)}`)
    }
  },
  {
    key: "gitlab",
    name: "GitLab",
    image: "GitLab.png",
    category: ProxiedServiceTemplateCategory.DeveloperTools,
    description: "Repos and pipelines on GitLab.",
    hostPattern: "gitlab.com/api/*",
    seed: {
      headers: [{ headerName: "PRIVATE-TOKEN" }]
    }
  },
  {
    key: "vercel",
    name: "Vercel",
    image: "Vercel.png",
    category: ProxiedServiceTemplateCategory.DeveloperTools,
    description: "Deploys and the Vercel API.",
    hostPattern: "api.vercel.com",
    seed: { headers: bearer() }
  },
  {
    key: "cloudflare",
    name: "Cloudflare",
    image: "Cloudflare.png",
    category: ProxiedServiceTemplateCategory.DeveloperTools,
    description: "DNS, CDN, and the Cloudflare API.",
    hostPattern: "api.cloudflare.com",
    seed: { headers: bearer() }
  },
  {
    key: "supabase",
    name: "Supabase",
    image: "Supabase.png",
    category: ProxiedServiceTemplateCategory.DeveloperTools,
    description: "Postgres, auth, and storage.",
    hostPattern: "*.supabase.co",
    seed: { headers: [{ headerName: "apikey" }] }
  },
  {
    key: "npm",
    name: "npm",
    image: "NPM.svg",
    category: ProxiedServiceTemplateCategory.DeveloperTools,
    description: "The npm package registry.",
    hostPattern: "registry.npmjs.org",
    seed: { headers: bearer() }
  },
  {
    key: "github-npm",
    name: "GitHub Packages",
    image: "GitHub.png",
    category: ProxiedServiceTemplateCategory.DeveloperTools,
    description: "GitHub's npm package registry.",
    hostPattern: "npm.pkg.github.com",
    aliases: ["npm", "packages"],
    seed: { headers: bearer() }
  },

  // ---- Monitoring ----
  {
    key: "datadog",
    name: "Datadog",
    image: "Datadog.png",
    category: ProxiedServiceTemplateCategory.Monitoring,
    description: "Monitoring and analytics.",
    hostPattern: "api.datadoghq.com",
    seed: { headers: [{ headerName: "DD-API-KEY" }] }
  },
  {
    key: "sentry",
    name: "Sentry",
    image: "Sentry.svg",
    category: ProxiedServiceTemplateCategory.Monitoring,
    description: "Error and performance monitoring.",
    hostPattern: "sentry.io",
    seed: { headers: bearer() }
  },
  {
    key: "pagerduty",
    name: "PagerDuty",
    image: "PagerDuty.svg",
    category: ProxiedServiceTemplateCategory.Monitoring,
    description: "On-call and incident management.",
    hostPattern: "api.pagerduty.com",
    // PagerDuty uses `Authorization: Token token=<key>`, which a prefix rewrite can't express
    // (it inserts a space); substitution swaps the token by value regardless of format.
    seed: { substitutions: bearerSubstitution("PAGERDUTY_TOKEN", () => randomToken(20)) }
  },

  // ---- Productivity ----
  {
    key: "linear",
    name: "Linear",
    image: "Linear.svg",
    category: ProxiedServiceTemplateCategory.Productivity,
    description: "Issue tracking and project management.",
    hostPattern: "api.linear.app",
    // Linear personal API keys go in the Authorization header with no "Bearer" prefix.
    seed: { headers: [{ headerName: "Authorization" }] }
  },
  {
    key: "notion",
    name: "Notion",
    image: "Notion.svg",
    category: ProxiedServiceTemplateCategory.Productivity,
    description: "Notion workspace and docs.",
    hostPattern: "api.notion.com",
    seed: { headers: bearer() }
  },
  {
    key: "jira",
    name: "Jira",
    image: "Jira.svg",
    category: ProxiedServiceTemplateCategory.Productivity,
    description: "Atlassian Jira issue tracking.",
    hostPattern: "*.atlassian.net",
    seed: { basicAuth: { withPassword: true } }
  },

  // ---- Communication (email) ----
  {
    key: "postmark",
    name: "Postmark",
    image: "Postmark.png",
    category: ProxiedServiceTemplateCategory.Communication,
    description: "Transactional email.",
    hostPattern: "api.postmarkapp.com",
    seed: { headers: [{ headerName: "X-Postmark-Server-Token" }] }
  },

  // ---- Commerce ----
  {
    key: "shopify",
    name: "Shopify",
    image: "Shopify.svg",
    category: ProxiedServiceTemplateCategory.Commerce,
    description: "Shopify e-commerce API.",
    hostPattern: "*.myshopify.com",
    seed: { headers: [{ headerName: "X-Shopify-Access-Token" }] }
  }
];

export const POPULAR_PROXIED_SERVICE_TEMPLATES: string[] = [
  "openai",
  "anthropic",
  "github",
  "slack",
  "stripe"
];

export const CUSTOM_TEMPLATE_KEY = "custom";

export const getProxiedServiceTemplate = (key: string) =>
  PROXIED_SERVICE_TEMPLATES.find((template) => template.key === key);
