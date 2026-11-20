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
import { AgentVaultHttpMethod, AgentVaultServiceType } from "../agent-vault/agent-vault-enums";
import { refineNoDuplicates } from "../agent-vault/agent-vault-list-schema-fns";
import { pathPrefixSchema } from "../agent-vault/agent-vault-path-prefix-schemas";
import { toolNameSchema } from "../agent-vault/agent-vault-tool-name-schemas";

export const AGENT_VAULT_MAX_HOOK_URL_LENGTH = 2048;
export const AGENT_VAULT_MIN_HOOK_SECRET_LENGTH = 32;
export const AGENT_VAULT_MAX_HOOK_SECRET_LENGTH = 512;
export const AGENT_VAULT_MAX_HOOK_RULES = 50;
export const AGENT_VAULT_MAX_HOOK_RULE_ENTRIES = 100;
export const AGENT_VAULT_MAX_HOOK_RULE_SERVICE_LENGTH = 64;

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

const hookRuleMethodsSchema = z
  .array(z.nativeEnum(AgentVaultHttpMethod))
  .min(1, "List at least one method, or leave 'methods' out to match every method.")
  .max(Object.keys(AgentVaultHttpMethod).length)
  .transform((methods) => [...new Set(methods)]);

const hookRulePathsSchema = z
  .array(pathPrefixSchema)
  .min(1, "List at least one path prefix, or leave 'paths' out to match every path.")
  .max(AGENT_VAULT_MAX_HOOK_RULE_ENTRIES, ruleListLimitMessage("path prefixes"))
  .superRefine(refineNoDuplicates);

const hookRuleToolsSchema = z
  .array(toolNameSchema)
  .min(1, "List at least one tool, or leave 'tools' out to match every tool.")
  .max(AGENT_VAULT_MAX_HOOK_RULE_ENTRIES, ruleListLimitMessage("tools"))
  .superRefine(refineNoDuplicates);

const NARROWING_MIX_MESSAGE =
  "A rule narrows an HTTP service by 'methods' and 'paths' or an MCP service by 'tools', not both.";

/**
 * A rule picks the requests of one of the project's services that go to the hook, optionally narrowed to some HTTP
 * methods and path prefixes, or to some MCP tools. The API names the service; it is saved as a link to that service,
 * so a rename carries over and deleting the service removes it from the hook.
 */
export const AgentVaultHookRuleSchema = z
  .object({
    service: z
      .string()
      .trim()
      .toLowerCase()
      .min(1, "Enter the name of the service this rule applies to.")
      .max(
        AGENT_VAULT_MAX_HOOK_RULE_SERVICE_LENGTH,
        `A service name in a rule can be at most ${AGENT_VAULT_MAX_HOOK_RULE_SERVICE_LENGTH} characters.`
      )
      .describe(AGENT_VAULT.HOOK.ruleService),
    methods: hookRuleMethodsSchema.optional().describe(AGENT_VAULT.HOOK.ruleMethods),
    paths: hookRulePathsSchema.optional().describe(AGENT_VAULT.HOOK.rulePaths),
    tools: hookRuleToolsSchema.optional().describe(AGENT_VAULT.HOOK.ruleTools)
  })
  .superRefine((rule, ctx) => {
    if (rule.tools && (rule.methods || rule.paths)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: NARROWING_MIX_MESSAGE });
    }
  });

export const AgentVaultHookRulesSchema = AgentVaultHookRuleSchema.array()
  .max(AGENT_VAULT_MAX_HOOK_RULES, `A hook can have at most ${AGENT_VAULT_MAX_HOOK_RULES} rules.`)
  .superRefine((rules, ctx) => {
    const seen = new Set<string>();
    rules.forEach((rule, index) => {
      if (seen.has(rule.service)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "service"],
          message: `'${rule.service}' is in more than one rule. List each service once, with all its methods, paths or tools in that rule.`
        });
      }
      seen.add(rule.service);
    });
  });

/** A PATCH of one service's narrowing in a hook: a field left out keeps its value, null removes it. */
export const AgentVaultHookServiceNarrowingUpdateSchema = z
  .object({
    methods: hookRuleMethodsSchema.nullable().optional().describe(AGENT_VAULT.HOOK.updateRuleMethods),
    paths: hookRulePathsSchema.nullable().optional().describe(AGENT_VAULT.HOOK.updateRulePaths),
    tools: hookRuleToolsSchema.nullable().optional().describe(AGENT_VAULT.HOOK.updateRuleTools)
  })
  .refine((fields) => Object.values(fields).some((value) => value !== undefined), {
    message: "Provide at least one of 'methods', 'paths' or 'tools'."
  });

export type TAgentVaultHookRuleInput = z.infer<typeof AgentVaultHookRuleSchema>;
export type TAgentVaultHookServiceNarrowingUpdate = z.infer<typeof AgentVaultHookServiceNarrowingUpdateSchema>;

export type THookRuleNarrowing = { methods?: AgentVaultHttpMethod[]; paths?: string[]; tools?: string[] };

/** A rule as reads return it and resolve sends it: the service's current name and its narrowing. */
export type TAgentVaultHookRuleView = { service: string } & THookRuleNarrowing;

/** A rule as resolve sends it to the proxy, which matches by name. */
export type TResolvedHookRule = TAgentVaultHookRuleView;

/** A hook's link to one of its services, as the link DAL reads it. */
export type THookServiceLink = {
  hookId: string;
  serviceId: string;
  serviceName: string;
  serviceType: AgentVaultServiceType;
  position: number;
  methods: unknown;
  paths: unknown;
  tools: unknown;
};

/** A link as written: the service by ID, and the narrowing, null where it matches everything. */
export type THookServiceLinkInsert = {
  serviceId: string;
  position: number;
  methods: AgentVaultHttpMethod[] | null;
  paths: string[] | null;
  tools: string[] | null;
};

const asStringList = (value: unknown) => (Array.isArray(value) ? (value as string[]) : undefined);

export const pickHookRuleNarrowing = (link: { methods?: unknown; paths?: unknown; tools?: unknown }) => {
  const methods = asStringList(link.methods) as AgentVaultHttpMethod[] | undefined;
  const paths = asStringList(link.paths);
  const tools = asStringList(link.tools);
  return {
    ...(methods ? { methods } : {}),
    ...(paths ? { paths } : {}),
    ...(tools ? { tools } : {})
  } satisfies THookRuleNarrowing;
};

export const toHookRuleView = (link: THookServiceLink): TAgentVaultHookRuleView => ({
  service: link.serviceName,
  ...pickHookRuleNarrowing(link)
});

/** Groups links by hook, each hook's in rule order. */
export const groupHookRuleViews = (links: THookServiceLink[]): Map<string, TAgentVaultHookRuleView[]> => {
  const byHook = new Map<string, TAgentVaultHookRuleView[]>();
  [...links]
    .sort((left, right) => left.position - right.position)
    .forEach((link) => {
      const rules = byHook.get(link.hookId) ?? [];
      rules.push(toHookRuleView(link));
      byHook.set(link.hookId, rules);
    });
  return byHook;
};

/**
 * The rules resolve sends for a hook, by the names of the service rows sent in the same response. A link to a service
 * outside the session is left out, since the proxy could never match it. Undefined means the hook goes out as no hook:
 * it has services and none is in this session, or it was left without services after they were deleted. Either way
 * it would otherwise suddenly check every request.
 */
export const toResolvedHookRules = (
  {
    links,
    appliesToAllServices
  }: {
    links: { serviceId: string; methods: unknown; paths: unknown; tools: unknown }[];
    appliesToAllServices: boolean;
  },
  serviceNamesById: ReadonlyMap<string, string>
): TResolvedHookRule[] | undefined => {
  if (!links.length) return appliesToAllServices ? [] : undefined;
  const rules = links.flatMap((link) => {
    const service = serviceNamesById.get(link.serviceId);
    return service ? [{ service, ...pickHookRuleNarrowing(link) }] : [];
  });
  return rules.length ? rules : undefined;
};

const SERVICE_TYPE_NAMES: Record<AgentVaultServiceType, string> = {
  [AgentVaultServiceType.Http]: "an HTTP",
  [AgentVaultServiceType.Mcp]: "an MCP",
  [AgentVaultServiceType.Postgres]: "a PostgreSQL",
  [AgentVaultServiceType.Mysql]: "a MySQL",
  [AgentVaultServiceType.Ssh]: "an SSH"
};

/** Refuses a narrowing the service's type can't use, since the proxy would ignore it and check the whole service. */
export const assertHookNarrowingFitsService = (
  narrowing: THookRuleNarrowing,
  service: { name: string; type: AgentVaultServiceType }
) => {
  const kind = SERVICE_TYPE_NAMES[service.type];
  if (narrowing.tools && (narrowing.methods || narrowing.paths)) {
    throw new BadRequestError({ message: NARROWING_MIX_MESSAGE });
  }
  if ((narrowing.methods || narrowing.paths) && service.type !== AgentVaultServiceType.Http) {
    throw new BadRequestError({
      message: `'${service.name}' is ${kind} service, and only an HTTP service can be narrowed by methods or paths. Leave them out to check every request to it.`
    });
  }
  if (narrowing.tools && service.type !== AgentVaultServiceType.Mcp) {
    throw new BadRequestError({
      message: `'${service.name}' is ${kind} service, and only an MCP service can be narrowed by tools. Leave them out to check every request to it.`
    });
  }
};

/**
 * Turns rules sent by the API into links. Every rule must name one of the project's services (never a session's
 * inline one), and its narrowing must fit that service's type. `projectServices` are the project's services the rules
 * name, read in the caller's transaction.
 */
export const toHookServiceLinks = (
  rules: TAgentVaultHookRuleInput[],
  projectServices: { id: string; name: string; type: string }[]
): THookServiceLinkInsert[] => {
  const servicesByName = new Map(projectServices.map((service) => [service.name, service]));
  return rules.map((rule, position) => {
    const service = servicesByName.get(rule.service);
    if (!service) {
      throw new NotFoundError({
        message: `There's no service called '${rule.service}' in this project. A hook rule can only name one of the project's services.`
      });
    }
    assertHookNarrowingFitsService(rule, { name: service.name, type: service.type as AgentVaultServiceType });
    return {
      serviceId: service.id,
      position,
      methods: rule.methods ?? null,
      paths: rule.paths ?? null,
      tools: rule.tools ?? null
    };
  });
};

export const assertAgentVaultHooksOnPlan = async (licenseService: Pick<TLicenseService, "getPlan">, orgId: string) => {
  const plan = await licenseService.getPlan(orgId);
  if (!plan.has(PlanFeature.AgentVaultHooks))
    throw new BadRequestError({ message: AGENT_VAULT_HOOKS_NOT_ON_PLAN_MESSAGE });
};
