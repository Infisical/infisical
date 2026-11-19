import RE2 from "re2";
import { z } from "zod";

import { PlanFeature, TLicenseService } from "@app/domains/platform/license/ce/module";
import { AGENT_VAULT } from "@app/lib/api-docs";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import {
  AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE,
  AGENT_VAULT_NO_CONTROL_CHARS_RE,
  hasLoneSurrogate
} from "../agent-vault/agent-vault-credential-schemas";
import { AgentVaultHttpMethod } from "../agent-vault/agent-vault-enums";
import { refineNoDuplicates } from "../agent-vault/agent-vault-list-schema-fns";
import { pathPrefixSchema } from "../agent-vault/agent-vault-path-prefix-schemas";
import { toolNameSchema } from "../agent-vault/agent-vault-tool-name-schemas";

export const AGENT_VAULT_MAX_HOOK_URL_LENGTH = 2048;
export const AGENT_VAULT_MIN_HOOK_SECRET_LENGTH = 32;
export const AGENT_VAULT_MAX_HOOK_SECRET_LENGTH = 512;
export const AGENT_VAULT_MAX_HOOK_RULES = 50;
export const AGENT_VAULT_MAX_HOOK_RULE_ENTRIES = 100;
// A rule names an unnamed inline service by its first host, so the bound is a host's, not a service name's.
export const AGENT_VAULT_MAX_HOOK_RULE_SERVICE_LENGTH = 255;

export const AGENT_VAULT_HOOKS_NOT_ON_PLAN_MESSAGE =
  "Hooks aren't included in your plan, so they can't be added or changed. Existing hooks keep working. Upgrade to add one.";

const HOOK_URL_EXAMPLE = "https://hooks.example.com/agent-vault";
const HOOK_URL_SCHEME_RE = new RE2(/^https?:\/\//i);
const HOOK_SECRET_RE = new RE2(/^[\x21-\x7e]+$/);
const HOOK_URL_PERCENT_ESCAPE_RE = new RE2(/%[0-9a-f]{2}/gi);
const HOOK_URL_STRAY_CHARACTERS_MESSAGE = `Enter a URL without backslashes or stray % signs, as in ${HOOK_URL_EXAMPLE}.`;
const HOOK_URL_INVALID_MESSAGE = `The hook URL isn't a valid URL. Enter the full address, as in ${HOOK_URL_EXAMPLE}.`;

export const describeHookUrlProblem = (raw: string): string | null => {
  if (!AGENT_VAULT_NO_CONTROL_CHARS_RE.test(raw)) return AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE;
  if (hasLoneSurrogate(raw)) return "The hook URL contains invalid text. Copy the URL and try again.";
  if ([...raw].some((character) => !character.trim())) return "The hook URL can't contain spaces.";
  if (raw.includes("{{")) return "Variables aren't supported in the hook URL. Enter the URL itself.";
  // Checked on the raw text because the URL parser accepts "https:host" and backslashes as if they were "https://".
  if (!HOOK_URL_SCHEME_RE.test(raw)) {
    return `The hook URL must start with https:// or http://, as in ${HOOK_URL_EXAMPLE}.`;
  }
  // Also on the raw text: the URL parser turns backslashes into slashes and decodes % escapes in the host.
  if (raw.includes("\\") || raw.replace(HOOK_URL_PERCENT_ESCAPE_RE, "").includes("%")) {
    return HOOK_URL_STRAY_CHARACTERS_MESSAGE;
  }
  const afterScheme = raw.slice(raw.indexOf("//") + 2);
  const authorityEnd = afterScheme.search(/[/?#]/);
  const authority = authorityEnd === -1 ? afterScheme : afterScheme.slice(0, authorityEnd);
  if (!authority) return HOOK_URL_INVALID_MESSAGE;
  if (authority.slice(authority.lastIndexOf("@") + 1).includes("%")) return HOOK_URL_STRAY_CHARACTERS_MESSAGE;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return HOOK_URL_INVALID_MESSAGE;
  }

  // The URL is shown in reads, audit logs and session details, so it must not carry credentials.
  if (url.username || url.password) return "The hook URL can't contain a username or password.";
  if (raw.includes("#")) return "The hook URL can't contain a fragment (the part after #).";
  if (raw.includes("?")) return "Hook URLs can't include a query string.";

  return null;
};

export const AgentVaultHookUrlSchema = z
  .string()
  .trim()
  .min(1, "Enter the hook URL.")
  .max(AGENT_VAULT_MAX_HOOK_URL_LENGTH, `The hook URL can be at most ${AGENT_VAULT_MAX_HOOK_URL_LENGTH} characters.`)
  .superRefine((raw, ctx) => {
    // min already reports an empty URL; one message is enough.
    if (!raw) return;
    const problem = describeHookUrlProblem(raw);
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
  });

// One issue at most, so an empty field doesn't show three messages. Never trimmed: the proxy signs with it as typed.
// Never expanded as a variable either: it only signs the proxy's checks to the hook, so braces in it are allowed.
export const AgentVaultHookSecretSchema = z.string().superRefine((value, ctx) => {
  let message: string | undefined;
  if (!value) message = "Enter a secret for the hook.";
  // Some RE2 builds match a lone surrogate against an ASCII class, so it is checked on its own.
  else if (!HOOK_SECRET_RE.test(value) || hasLoneSurrogate(value)) {
    message = "The hook secret can only use letters, numbers and symbols, with no spaces.";
  } else if (value.length < AGENT_VAULT_MIN_HOOK_SECRET_LENGTH) {
    message = `The hook secret must be at least ${AGENT_VAULT_MIN_HOOK_SECRET_LENGTH} characters.`;
  } else if (value.length > AGENT_VAULT_MAX_HOOK_SECRET_LENGTH) {
    message = `The hook secret can be at most ${AGENT_VAULT_MAX_HOOK_SECRET_LENGTH} characters.`;
  }
  if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
});

const ruleListLimitMessage = (what: string) => `A rule can list at most ${AGENT_VAULT_MAX_HOOK_RULE_ENTRIES} ${what}.`;

/**
 * A rule picks the requests of one service (by name, so one grammar covers project and inline services) that go to
 * the hook, optionally narrowed to some HTTP methods and path prefixes, or to some MCP tools. The service's type isn't
 * known when a rule is saved, since inline names differ per session, so a narrowing that doesn't fit the matched
 * service (methods on an MCP service, anything on a database or SSH service) is ignored by the proxy and the rule
 * matches the whole service. That fails closed: more traffic goes to the hook, never less.
 */
export const AgentVaultHookRuleSchema = z
  .object({
    service: z
      .string()
      .trim()
      .min(1, "Enter the name of the service this rule applies to.")
      .max(
        AGENT_VAULT_MAX_HOOK_RULE_SERVICE_LENGTH,
        `A service name in a rule can be at most ${AGENT_VAULT_MAX_HOOK_RULE_SERVICE_LENGTH} characters.`
      )
      .regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE)
      .describe(AGENT_VAULT.HOOK.ruleService),
    methods: z
      .array(z.nativeEnum(AgentVaultHttpMethod))
      .min(1, "List at least one method, or leave 'methods' out to match every method.")
      .max(Object.keys(AgentVaultHttpMethod).length)
      .transform((methods) => [...new Set(methods)])
      .optional()
      .describe(AGENT_VAULT.HOOK.ruleMethods),
    paths: z
      .array(pathPrefixSchema)
      .min(1, "List at least one path prefix, or leave 'paths' out to match every path.")
      .max(AGENT_VAULT_MAX_HOOK_RULE_ENTRIES, ruleListLimitMessage("path prefixes"))
      .superRefine(refineNoDuplicates)
      .optional()
      .describe(AGENT_VAULT.HOOK.rulePaths),
    tools: z
      .array(toolNameSchema)
      .min(1, "List at least one tool, or leave 'tools' out to match every tool.")
      .max(AGENT_VAULT_MAX_HOOK_RULE_ENTRIES, ruleListLimitMessage("tools"))
      .superRefine(refineNoDuplicates)
      .optional()
      .describe(AGENT_VAULT.HOOK.ruleTools)
  })
  .refine((rule) => !rule.tools || (!rule.methods && !rule.paths), {
    message:
      "A rule narrows an HTTP service by 'methods' and 'paths' or an MCP service by 'tools', not both. Split it into two rules."
  });

export const AgentVaultHookRulesSchema = AgentVaultHookRuleSchema.array().max(
  AGENT_VAULT_MAX_HOOK_RULES,
  `A hook can have at most ${AGENT_VAULT_MAX_HOOK_RULES} rules.`
);

export type TAgentVaultHookRule = z.infer<typeof AgentVaultHookRuleSchema>;

// Reads the stored rules back into their API shape, dropping any key a later version might add.
export const toHookRules = (stored: unknown): TAgentVaultHookRule[] =>
  (Array.isArray(stored) ? (stored as TAgentVaultHookRule[]) : []).map((rule) => ({
    service: rule.service,
    ...(rule.methods ? { methods: rule.methods } : {}),
    ...(rule.paths ? { paths: rule.paths } : {}),
    ...(rule.tools ? { tools: rule.tools } : {})
  }));

export const assertAgentVaultHooksOnPlan = async (licenseService: Pick<TLicenseService, "getPlan">, orgId: string) => {
  const plan = await licenseService.getPlan(orgId);
  if (!plan.has(PlanFeature.AgentVaultHooks))
    throw new BadRequestError({ message: AGENT_VAULT_HOOKS_NOT_ON_PLAN_MESSAGE });
};

// Whether resolve sends the session's hook. Only a plan known to leave hooks out drops it: a hook only adds checks,
// so a License Server outage (a fallback plan with no last known one, or getPlan throwing) keeps it running.
export const isAgentVaultHooksOnPlanForResolve = async (
  licenseService: Pick<TLicenseService, "getPlan" | "getLastKnownPlan">,
  orgId: string
): Promise<boolean> => {
  try {
    const plan = await licenseService.getPlan(orgId);
    if (!plan.isFallback) return plan.has(PlanFeature.AgentVaultHooks);
    const lastKnown = await licenseService.getLastKnownPlan(orgId);
    return lastKnown ? lastKnown.plan.has(PlanFeature.AgentVaultHooks) : true;
  } catch (error) {
    logger.warn(error, `agentVaultResolve: could not read the plan, keeping the session's hook [orgId=${orgId}]`);
    return true;
  }
};
