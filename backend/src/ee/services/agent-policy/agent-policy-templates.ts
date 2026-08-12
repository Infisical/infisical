import { crypto } from "@app/lib/crypto";

// A copy of frontend/src/helpers/proxiedServiceTemplates.ts, minus the display-only fields (icon,
// description, category) which stay in the frontend. This copy is authoritative for anything that
// reaches the wire: the host pattern a target seeds its rules with, which credential slots a policy
// has, and the placeholder value the agent is handed. Keep the two in step when adding a target.

export enum AgentPolicyCredentialRole {
  HeaderRewrite = "header-rewrite",
  CredentialSubstitution = "credential-substitution"
}

export enum AgentPolicySubstitutionSurface {
  Header = "header",
  Path = "path",
  Query = "query",
  Body = "body"
}

export enum AgentPolicyHeaderPurpose {
  Username = "username",
  Password = "password"
}

export const AGENT_POLICY_CUSTOM_TARGET = "custom";

type TSubstitutionSeed = {
  placeholderKey: string;
  surfaces: AgentPolicySubstitutionSurface[];
  generatePlaceholder: () => string;
};

type THeaderSeed = {
  headerName: string;
  headerPrefix?: string;
};

type TTemplate = {
  key: string;
  name: string;
  hostPattern: string;
  seed: {
    headers?: THeaderSeed[];
    basicAuth?: { withPassword?: boolean };
    substitutions?: TSubstitutionSeed[];
  };
};

// A credential slot the policy author fills with one secret reference. Everything except the secret
// reference is fixed by the template, which is why the create sheet only asks for the secret.
export type TAgentPolicyCredentialSlot = {
  slotKey: string;
  label: string;
  role: AgentPolicyCredentialRole;
  headerName?: string;
  headerPrefix?: string;
  headerPurpose?: AgentPolicyHeaderPurpose;
  placeholderKey?: string;
  substitutionSurfaces?: AgentPolicySubstitutionSurface[];
};

const ALPHANUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const BASE64URL = `${ALPHANUM}-_`;
const HEX = "0123456789abcdef";
const DIGITS = "0123456789";
const UPPERALNUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

// Rejection sampling on a CSPRNG: the frontend copy uses Math.random, which is fine for a decoy there
// but would make a server-issued placeholder predictable, and a predictable placeholder is guessable
// by the agent holding it.
const randomToken = (length: number, alphabet: string = ALPHANUM) => {
  const max = Math.floor(256 / alphabet.length) * alphabet.length;
  let out = "";
  while (out.length < length) {
    const bytes = crypto.randomBytes(length * 2);
    for (let i = 0; i < bytes.length && out.length < length; i += 1) {
      if (bytes[i] < max) out += alphabet[bytes[i] % alphabet.length];
    }
  }
  return out;
};

const HEADER_AND_BODY = [AgentPolicySubstitutionSurface.Header, AgentPolicySubstitutionSurface.Body];

const bearer = (headerName = "Authorization", headerPrefix = "Bearer"): THeaderSeed[] => [{ headerName, headerPrefix }];

const bearerSubstitution = (
  placeholderKey: string,
  generatePlaceholder: () => string,
  surfaces: AgentPolicySubstitutionSurface[] = [AgentPolicySubstitutionSurface.Header]
): TSubstitutionSeed[] => [{ placeholderKey, surfaces, generatePlaceholder }];

export const AGENT_POLICY_TEMPLATES: TTemplate[] = [
  {
    key: "openai",
    name: "OpenAI",
    hostPattern: "api.openai.com",
    seed: { substitutions: bearerSubstitution("OPENAI_API_KEY", () => `sk-proj-${randomToken(48)}`) }
  },
  {
    key: "anthropic",
    name: "Anthropic",
    hostPattern: "api.anthropic.com",
    seed: {
      substitutions: bearerSubstitution("ANTHROPIC_API_KEY", () => `sk-ant-api03-${randomToken(93, BASE64URL)}AA`)
    }
  },
  {
    key: "gemini",
    name: "Google Gemini",
    hostPattern: "generativelanguage.googleapis.com",
    seed: {
      substitutions: bearerSubstitution("GEMINI_API_KEY", () => `AIza${randomToken(35)}`, [
        AgentPolicySubstitutionSurface.Query,
        AgentPolicySubstitutionSurface.Header
      ])
    }
  },
  {
    key: "mistral",
    name: "Mistral AI",
    hostPattern: "api.mistral.ai",
    seed: { substitutions: bearerSubstitution("MISTRAL_API_KEY", () => randomToken(32)) }
  },
  {
    key: "cohere",
    name: "Cohere",
    hostPattern: "api.cohere.com",
    seed: { substitutions: bearerSubstitution("CO_API_KEY", () => randomToken(40)) }
  },
  {
    key: "groq",
    name: "Groq",
    hostPattern: "api.groq.com",
    seed: { substitutions: bearerSubstitution("GROQ_API_KEY", () => `gsk_${randomToken(52)}`) }
  },
  {
    key: "perplexity",
    name: "Perplexity",
    hostPattern: "api.perplexity.ai",
    seed: { substitutions: bearerSubstitution("PERPLEXITY_API_KEY", () => `pplx-${randomToken(48)}`) }
  },
  {
    key: "openrouter",
    name: "OpenRouter",
    hostPattern: "openrouter.ai",
    seed: { substitutions: bearerSubstitution("OPENROUTER_API_KEY", () => `sk-or-v1-${randomToken(64, HEX)}`) }
  },
  {
    key: "together",
    name: "Together AI",
    hostPattern: "api.together.ai, api.together.xyz",
    seed: { substitutions: bearerSubstitution("TOGETHER_API_KEY", () => randomToken(64, HEX)) }
  },
  {
    key: "deepseek",
    name: "DeepSeek",
    hostPattern: "api.deepseek.com",
    seed: { substitutions: bearerSubstitution("DEEPSEEK_API_KEY", () => `sk-${randomToken(32)}`) }
  },
  {
    key: "xai",
    name: "xAI (Grok)",
    hostPattern: "api.x.ai",
    seed: { substitutions: bearerSubstitution("XAI_API_KEY", () => `xai-${randomToken(80)}`) }
  },
  {
    key: "fireworks",
    name: "Fireworks AI",
    hostPattern: "api.fireworks.ai",
    seed: { substitutions: bearerSubstitution("FIREWORKS_API_KEY", () => `fw_${randomToken(24)}`) }
  },
  {
    key: "stripe",
    name: "Stripe",
    hostPattern: "api.stripe.com",
    seed: { substitutions: bearerSubstitution("STRIPE_SECRET_KEY", () => `sk_live_${randomToken(24)}`) }
  },
  {
    key: "twilio",
    name: "Twilio",
    hostPattern: "api.twilio.com",
    seed: { basicAuth: { withPassword: true } }
  },
  {
    key: "sendgrid",
    name: "SendGrid",
    hostPattern: "api.sendgrid.com",
    seed: {
      substitutions: bearerSubstitution("SENDGRID_API_KEY", () => `SG.${randomToken(22)}.${randomToken(43, BASE64URL)}`)
    }
  },
  {
    key: "resend",
    name: "Resend",
    hostPattern: "api.resend.com",
    seed: { substitutions: bearerSubstitution("RESEND_API_KEY", () => `re_${randomToken(24)}`) }
  },
  {
    key: "slack",
    name: "Slack",
    hostPattern: "slack.com, api.slack.com",
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
          generatePlaceholder: () => `xoxb-${randomToken(11, DIGITS)}-${randomToken(13, DIGITS)}-${randomToken(24)}`
        }
      ]
    }
  },
  {
    key: "telegram",
    name: "Telegram",
    hostPattern: "api.telegram.org",
    seed: {
      substitutions: bearerSubstitution(
        "TELEGRAM_BOT_TOKEN",
        () => `${randomToken(10, DIGITS)}:${randomToken(35, BASE64URL)}`,
        [AgentPolicySubstitutionSurface.Path]
      )
    }
  },
  {
    key: "discord",
    name: "Discord",
    hostPattern: "discord.com/api/*",
    seed: { headers: bearer("Authorization", "Bot") }
  },
  {
    key: "github",
    name: "GitHub",
    hostPattern: "api.github.com",
    seed: { substitutions: bearerSubstitution("GITHUB_TOKEN", () => `ghp_${randomToken(36)}`) }
  },
  {
    key: "gitlab",
    name: "GitLab",
    hostPattern: "gitlab.com/api/*",
    seed: { headers: [{ headerName: "PRIVATE-TOKEN" }] }
  },
  {
    key: "vercel",
    name: "Vercel",
    hostPattern: "api.vercel.com",
    seed: { headers: bearer() }
  },
  {
    key: "cloudflare",
    name: "Cloudflare",
    hostPattern: "api.cloudflare.com",
    seed: { headers: bearer() }
  },
  {
    key: "supabase",
    name: "Supabase",
    hostPattern: "*.supabase.co",
    seed: { headers: [{ headerName: "apikey" }] }
  },
  {
    key: "npm",
    name: "npm",
    hostPattern: "registry.npmjs.org",
    seed: { headers: bearer() }
  },
  {
    key: "github-npm",
    name: "GitHub Packages",
    hostPattern: "npm.pkg.github.com",
    seed: { headers: bearer() }
  },
  {
    key: "datadog",
    name: "Datadog",
    hostPattern: "api.datadoghq.com",
    seed: { headers: [{ headerName: "DD-API-KEY" }] }
  },
  {
    key: "sentry",
    name: "Sentry",
    hostPattern: "sentry.io",
    seed: { headers: bearer() }
  },
  {
    key: "pagerduty",
    name: "PagerDuty",
    hostPattern: "api.pagerduty.com",
    seed: { substitutions: bearerSubstitution("PAGERDUTY_TOKEN", () => randomToken(20)) }
  },
  {
    key: "linear",
    name: "Linear",
    hostPattern: "api.linear.app",
    seed: { headers: [{ headerName: "Authorization" }] }
  },
  {
    key: "notion",
    name: "Notion",
    hostPattern: "api.notion.com",
    seed: { headers: bearer() }
  },
  {
    key: "jira",
    name: "Jira",
    hostPattern: "*.atlassian.net",
    seed: { basicAuth: { withPassword: true } }
  },
  {
    key: "google-workspace",
    name: "Google Workspace",
    hostPattern:
      "gmail.googleapis.com/*, sheets.googleapis.com/*, www.googleapis.com/calendar/*, www.googleapis.com/drive/*, www.googleapis.com/upload/drive/*",
    seed: {
      substitutions: bearerSubstitution("GOOGLE_ACCESS_TOKEN", () => `ya29.${randomToken(60, BASE64URL)}`, [
        AgentPolicySubstitutionSurface.Header
      ])
    }
  },
  {
    key: "postmark",
    name: "Postmark",
    hostPattern: "api.postmarkapp.com",
    seed: { headers: [{ headerName: "X-Postmark-Server-Token" }] }
  },
  {
    key: "shopify",
    name: "Shopify",
    hostPattern: "*.myshopify.com",
    seed: { headers: [{ headerName: "X-Shopify-Access-Token" }] }
  }
];

export const AGENT_POLICY_TARGETS = [...AGENT_POLICY_TEMPLATES.map((t) => t.key), AGENT_POLICY_CUSTOM_TARGET];

export const findAgentPolicyTemplate = (target: string) => AGENT_POLICY_TEMPLATES.find((t) => t.key === target);

// Words that read wrong in title case. Without these, OPENAI_API_KEY labels as "Openai Api Key".
const ACRONYMS = new Set(["API", "ID", "URL", "AI", "SDK", "PAT", "CO", "DD", "SG"]);

// SLACK_APP_TOKEN -> "Slack App Token", so the create sheet can label a slot without the template
// carrying a second copy of the same words. The template name is used for the leading word when it
// matches, which is what turns OPENAI into "OpenAI" rather than "Openai".
const humanizeKey = (key: string, templateName?: string) => {
  const words = key.split(/[_-]/).filter(Boolean);
  return words
    .map((word, index) => {
      const upper = word.toUpperCase();
      if (index === 0 && templateName && templateName.replace(/[^a-zA-Z0-9]/g, "").toUpperCase() === upper) {
        return templateName;
      }
      if (ACRONYMS.has(upper)) return upper;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
};

// Expands a target into its credential slots. Placeholder values are generated per call, so each
// policy gets its own decoys and one policy's placeholder never unlocks another's credential.
export const buildAgentPolicyCredentialSlots = (
  target: string
): (TAgentPolicyCredentialSlot & { placeholderValue?: string })[] => {
  if (target === AGENT_POLICY_CUSTOM_TARGET) return [];

  const template = findAgentPolicyTemplate(target);
  if (!template) return [];

  const slots: (TAgentPolicyCredentialSlot & { placeholderValue?: string })[] = [];

  template.seed.substitutions?.forEach((sub) => {
    slots.push({
      slotKey: sub.placeholderKey,
      label: humanizeKey(sub.placeholderKey, template.name),
      role: AgentPolicyCredentialRole.CredentialSubstitution,
      placeholderKey: sub.placeholderKey,
      placeholderValue: sub.generatePlaceholder(),
      substitutionSurfaces: sub.surfaces
    });
  });

  template.seed.headers?.forEach((header) => {
    slots.push({
      slotKey: header.headerName,
      label: header.headerName === "Authorization" ? "API Key" : humanizeKey(header.headerName, template.name),
      role: AgentPolicyCredentialRole.HeaderRewrite,
      headerName: header.headerName,
      headerPrefix: header.headerPrefix
    });
  });

  if (template.seed.basicAuth) {
    slots.push({
      slotKey: AgentPolicyHeaderPurpose.Username,
      label: "Username",
      role: AgentPolicyCredentialRole.HeaderRewrite,
      headerName: "Authorization",
      headerPurpose: AgentPolicyHeaderPurpose.Username
    });
    if (template.seed.basicAuth.withPassword) {
      slots.push({
        slotKey: AgentPolicyHeaderPurpose.Password,
        label: "Password",
        role: AgentPolicyCredentialRole.HeaderRewrite,
        headerName: "Authorization",
        headerPurpose: AgentPolicyHeaderPurpose.Password
      });
    }
  }

  return slots;
};

// The rules a target seeds a new policy with: every method allowed on each host the template covers.
export const buildAgentPolicyDefaultRules = (target: string): { hostPattern: string; methods: string[] }[] => {
  const template = findAgentPolicyTemplate(target);
  if (!template) return [];
  return template.hostPattern
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean)
    .map((hostPattern) => ({ hostPattern, methods: [] }));
};
