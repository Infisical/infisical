import RE2 from "re2";
import { z } from "zod";

import { PlanFeature, TLicenseService } from "@app/domains/platform/license/ce/module";
import { AGENT_VAULT } from "@app/lib/api-docs";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

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
 * A rule picks the requests of one service that go to the hook, optionally narrowed to some HTTP methods and path
 * prefixes, or to some MCP tools. A project service is referenced by `serviceId`, so a rename carries over; any other
 * service (one sent inline, which differs per session) by `service`, its name. The service's type isn't known when a
 * rule is saved, so a narrowing that doesn't fit the matched service (methods on an MCP service, anything on a
 * database or SSH service) is ignored by the proxy and the rule matches the whole service. That fails closed: more
 * traffic goes to the hook, never less.
 */
export const AgentVaultHookRuleSchema = z
  .object({
    serviceId: z
      .string()
      .uuid("Enter the ID of one of the project's services, or send its name as 'service'.")
      .optional()
      .describe(AGENT_VAULT.HOOK.ruleServiceId),
    service: z
      .string()
      .trim()
      .toLowerCase()
      .min(1, "Enter the name of the service this rule applies to.")
      .max(
        AGENT_VAULT_MAX_HOOK_RULE_SERVICE_LENGTH,
        `A service name in a rule can be at most ${AGENT_VAULT_MAX_HOOK_RULE_SERVICE_LENGTH} characters.`
      )
      .regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE)
      .optional()
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
  .superRefine((rule, ctx) => {
    if (rule.serviceId === undefined && rule.service === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Choose the service this rule applies to: send 'serviceId' for a project service, or 'service' with its name."
      });
    } else if (rule.serviceId !== undefined && rule.service !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Send 'serviceId' or 'service' in a rule, not both."
      });
    }
    if (rule.tools && (rule.methods || rule.paths)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "A rule narrows an HTTP service by 'methods' and 'paths' or an MCP service by 'tools', not both. Split it into two rules."
      });
    }
  });

export const AgentVaultHookRulesSchema = AgentVaultHookRuleSchema.array().max(
  AGENT_VAULT_MAX_HOOK_RULES,
  `A hook can have at most ${AGENT_VAULT_MAX_HOOK_RULES} rules.`
);

export type TAgentVaultHookRuleInput = z.infer<typeof AgentVaultHookRuleSchema>;

type THookRuleNarrowing = { methods?: AgentVaultHttpMethod[]; paths?: string[]; tools?: string[] };

/** A rule as stored: a project service by ID, any other service by name. */
export type TStoredHookRule = ({ serviceId: string; service?: never } | { service: string; serviceId?: never }) &
  THookRuleNarrowing;

/** A rule as reads return it. `service` is the service's current name, or null when the service was deleted. */
export type TAgentVaultHookRuleView = { serviceId: string | null; service: string | null } & THookRuleNarrowing;

/** A rule as resolve sends it to the proxy, which matches by name. */
export type TResolvedHookRule = { service: string } & THookRuleNarrowing;

const pickNarrowing = (rule: THookRuleNarrowing): THookRuleNarrowing => ({
  ...(rule.methods ? { methods: rule.methods } : {}),
  ...(rule.paths ? { paths: rule.paths } : {}),
  ...(rule.tools ? { tools: rule.tools } : {})
});

// Reads the stored rules back, dropping any key a later version might add.
export const toStoredHookRules = (stored: unknown): TStoredHookRule[] =>
  (Array.isArray(stored) ? (stored as TStoredHookRule[]) : []).map((rule) =>
    rule.serviceId
      ? { serviceId: rule.serviceId, ...pickNarrowing(rule) }
      : { service: rule.service as string, ...pickNarrowing(rule) }
  );

export const collectHookRuleServiceIds = (rules: TStoredHookRule[]): string[] => [
  ...new Set(rules.flatMap((rule) => (rule.serviceId ? [rule.serviceId] : [])))
];

export const toHookRuleViews = (
  rules: TStoredHookRule[],
  serviceNamesById: ReadonlyMap<string, string>
): TAgentVaultHookRuleView[] =>
  rules.map((rule) =>
    rule.serviceId
      ? { serviceId: rule.serviceId, service: serviceNamesById.get(rule.serviceId) ?? null, ...pickNarrowing(rule) }
      : { serviceId: null, service: rule.service as string, ...pickNarrowing(rule) }
  );

// A rule whose service was deleted is dropped: no service of the session can carry that ID any more.
export const toResolvedHookRules = (
  rules: TStoredHookRule[],
  serviceNamesById: ReadonlyMap<string, string>
): TResolvedHookRule[] =>
  rules.flatMap((rule) => {
    const service = rule.serviceId ? serviceNamesById.get(rule.serviceId) : rule.service;
    return service ? [{ service, ...pickNarrowing(rule) }] : [];
  });

/**
 * Turns rules sent by the API into stored ones. A name that is one of the project's services is stored as that
 * service's ID, so the rule follows a rename; other names stay names, for services sent inline with a session.
 * `projectServices` are the project's services (never inline ones) whose ID or name the rules mention.
 */
export const toStoredHookRulesForSave = (
  rules: TAgentVaultHookRuleInput[],
  projectServices: { id: string; name: string }[]
): { rules: TStoredHookRule[]; serviceNamesById: Map<string, string> } => {
  const serviceNamesById = new Map(projectServices.map((service) => [service.id, service.name]));
  const serviceIdsByName = new Map(projectServices.map((service) => [service.name, service.id]));
  const stored = rules.map((rule, index): TStoredHookRule => {
    if (rule.serviceId) {
      if (!serviceNamesById.has(rule.serviceId)) {
        throw new NotFoundError({
          message: `Rule ${index + 1} names a service with ID '${rule.serviceId}' that isn't in this project.`
        });
      }
      return { serviceId: rule.serviceId, ...pickNarrowing(rule) };
    }
    const name = rule.service as string;
    const serviceId = serviceIdsByName.get(name);
    return serviceId ? { serviceId, ...pickNarrowing(rule) } : { service: name, ...pickNarrowing(rule) };
  });
  return { rules: stored, serviceNamesById };
};

export const assertAgentVaultHooksOnPlan = async (licenseService: Pick<TLicenseService, "getPlan">, orgId: string) => {
  const plan = await licenseService.getPlan(orgId);
  if (!plan.has(PlanFeature.AgentVaultHooks))
    throw new BadRequestError({ message: AGENT_VAULT_HOOKS_NOT_ON_PLAN_MESSAGE });
};
