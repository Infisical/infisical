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
export const AGENT_VAULT_MAX_HOOK_NARROWING_ENTRIES = 100;
export const AGENT_VAULT_MAX_HOOK_NAME_LENGTH = 64;

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

const narrowingLimitMessage = (what: string) =>
  `A service's hook can list at most ${AGENT_VAULT_MAX_HOOK_NARROWING_ENTRIES} ${what}.`;

const hookMethodsSchema = z
  .array(z.nativeEnum(AgentVaultHttpMethod))
  .min(1, "List at least one method, or leave 'methods' out to check every method.")
  .max(Object.keys(AgentVaultHttpMethod).length)
  .transform((methods) => [...new Set(methods)]);

const hookPathsSchema = z
  .array(pathPrefixSchema)
  .min(1, "List at least one path prefix, or leave 'paths' out to check every path.")
  .max(AGENT_VAULT_MAX_HOOK_NARROWING_ENTRIES, narrowingLimitMessage("path prefixes"))
  .superRefine(refineNoDuplicates);

const hookToolsSchema = z
  .array(toolNameSchema)
  .min(1, "List at least one tool, or leave 'tools' out to check every tool.")
  .max(AGENT_VAULT_MAX_HOOK_NARROWING_ENTRIES, narrowingLimitMessage("tools"))
  .superRefine(refineNoDuplicates);

const NARROWING_MIX_MESSAGE =
  "A hook narrows an HTTP service by 'methods' and 'paths' or an MCP service by 'tools', not both.";

/**
 * The hook a service or an inline service uses, by name, optionally narrowed to some HTTP methods and path prefixes or
 * to some MCP tools. With no narrowing the proxy asks it about every request (every connection for a database or SSH
 * service).
 */
export const AgentVaultServiceHookInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .toLowerCase()
      .min(1, "Enter the name of the hook.")
      .max(
        AGENT_VAULT_MAX_HOOK_NAME_LENGTH,
        `A hook name can be at most ${AGENT_VAULT_MAX_HOOK_NAME_LENGTH} characters.`
      )
      .describe(AGENT_VAULT.HOOK.serviceHookName),
    methods: hookMethodsSchema.optional().describe(AGENT_VAULT.HOOK.serviceHookMethods),
    paths: hookPathsSchema.optional().describe(AGENT_VAULT.HOOK.serviceHookPaths),
    tools: hookToolsSchema.optional().describe(AGENT_VAULT.HOOK.serviceHookTools)
  })
  .superRefine((hook, ctx) => {
    if (hook.tools && (hook.methods || hook.paths)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: NARROWING_MIX_MESSAGE });
    }
  });

export type TAgentVaultServiceHookInput = z.infer<typeof AgentVaultServiceHookInputSchema>;

export type THookNarrowing = { methods?: AgentVaultHttpMethod[]; paths?: string[]; tools?: string[] };

/** A service's hook as service reads return it. */
export type TAgentVaultServiceHookView = { id: string; name: string } & THookNarrowing;

/** The columns a service row keeps its hook in. Every write sets all four, so no narrowing outlives its hook. */
export type TServiceHookColumns = {
  hookId: string | null;
  hookMethods: string[] | null;
  hookPaths: string[] | null;
  hookTools: string[] | null;
};

export const NO_SERVICE_HOOK: TServiceHookColumns = {
  hookId: null,
  hookMethods: null,
  hookPaths: null,
  hookTools: null
};

export const toServiceHookColumns = (hookId: string, narrowing: THookNarrowing): TServiceHookColumns => ({
  hookId,
  hookMethods: narrowing.methods ?? null,
  hookPaths: narrowing.paths ?? null,
  hookTools: narrowing.tools ?? null
});

export const pickHookNarrowing = (row: {
  hookMethods?: string[] | null;
  hookPaths?: string[] | null;
  hookTools?: string[] | null;
}): THookNarrowing => ({
  ...(row.hookMethods ? { methods: row.hookMethods as AgentVaultHttpMethod[] } : {}),
  ...(row.hookPaths ? { paths: row.hookPaths } : {}),
  ...(row.hookTools ? { tools: row.hookTools } : {})
});

/** Null when the service has no hook, or its hook was deleted since the row was read. */
export const serviceHookView = (
  service: { hookId?: string | null } & Parameters<typeof pickHookNarrowing>[0],
  hookNames: ReadonlyMap<string, string>
): TAgentVaultServiceHookView | null => {
  const name = service.hookId ? hookNames.get(service.hookId) : undefined;
  return name ? { id: service.hookId!, name, ...pickHookNarrowing(service) } : null;
};

const normalizeList = (list: string[] | undefined) => (list ? [...new Set(list)].sort() : null);

// Compared as sets, since the order or a repeat of a method, path or tool doesn't change what the hook checks.
const sameList = (left: string[] | undefined, right: string[] | undefined) =>
  JSON.stringify(normalizeList(left)) === JSON.stringify(normalizeList(right));

/** Whether a service's hook input sets a different hook or narrowing than the row holds. */
export const isServiceHookChange = (
  hook: { id: string } & THookNarrowing,
  row: { hookId?: string | null } & Parameters<typeof pickHookNarrowing>[0]
) => {
  if (hook.id !== row.hookId) return true;
  const current = pickHookNarrowing(row);
  return (
    !sameList(hook.methods, current.methods) ||
    !sameList(hook.paths, current.paths) ||
    !sameList(hook.tools, current.tools)
  );
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
  narrowing: THookNarrowing,
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

export const hookNotFoundByName = (name: string) =>
  new NotFoundError({ message: `There's no hook called '${name}' in this project.` });

export const assertAgentVaultHooksOnPlan = async (licenseService: Pick<TLicenseService, "getPlan">, orgId: string) => {
  const plan = await licenseService.getPlan(orgId);
  if (!plan.has(PlanFeature.AgentVaultHooks))
    throw new BadRequestError({ message: AGENT_VAULT_HOOKS_NOT_ON_PLAN_MESSAGE });
};
