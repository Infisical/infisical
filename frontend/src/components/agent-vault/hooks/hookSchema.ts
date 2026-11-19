import { z } from "zod";

import {
  AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE,
  AGENT_VAULT_NO_CONTROL_CHARS_RE
} from "@app/helpers/agentVaultControlChars";
import { agentVaultDescriptionSchema } from "@app/helpers/agentVaultDescription";
import { pathPrefixError } from "@app/helpers/agentVaultPathPrefix";
import { AgentVaultHttpMethod, AgentVaultServiceType } from "@app/hooks/api/agentVault";
import {
  TAgentVaultHook,
  TAgentVaultHookRule,
  TCreateAgentVaultHookDTO,
  TUpdateAgentVaultHookDTO
} from "@app/hooks/api/agentVault/types";
import { slugSchema } from "@app/lib/schemas";

import {
  HTTP_METHODS,
  isAllMethods,
  toolNameError,
  UNCHANGED_SECRET
} from "../service-sheet/serviceSchema";

// Mirrors agent-vault-hook-fns.ts on the backend, so a value the API would refuse is marked on its field.
const MAX_HOOK_URL_LENGTH = 2048;
const MIN_HOOK_SECRET_LENGTH = 32;
const MAX_HOOK_SECRET_LENGTH = 512;
export const MAX_HOOK_RULES = 50;
const MAX_HOOK_RULE_ENTRIES = 100;
const MAX_HOOK_RULE_SERVICE_LENGTH = 255;

export const isPlainHttpUrl = (value: string) => /^http:\/\//i.test(value.trim());

export const hookUrlError = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return "Enter the hook URL.";
  if (trimmed.length > MAX_HOOK_URL_LENGTH) {
    return `The hook URL can be at most ${MAX_HOOK_URL_LENGTH} characters.`;
  }
  if (!AGENT_VAULT_NO_CONTROL_CHARS_RE.test(trimmed)) return AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE;
  if (/\s/.test(trimmed)) return "The hook URL can't contain spaces.";
  if (trimmed.includes("{{")) {
    return "Variables aren't supported in the hook URL. Enter the URL itself.";
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return "The hook URL must start with https:// or http://, as in https://hooks.example.com/agent-vault.";
  }
  const strayCharactersMessage =
    "Enter a URL without backslashes or stray % signs, as in https://hooks.example.com/agent-vault.";
  const invalidUrlMessage =
    "The hook URL isn't a valid URL. Enter the full address, as in https://hooks.example.com/agent-vault.";
  if (trimmed.includes("\\") || trimmed.replace(/%[0-9a-f]{2}/gi, "").includes("%")) {
    return strayCharactersMessage;
  }
  const afterScheme = trimmed.slice(trimmed.indexOf("//") + 2);
  const authorityEnd = afterScheme.search(/[/?#]/);
  const authority = authorityEnd === -1 ? afterScheme : afterScheme.slice(0, authorityEnd);
  if (!authority) return invalidUrlMessage;
  if (authority.slice(authority.lastIndexOf("@") + 1).includes("%")) return strayCharactersMessage;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return invalidUrlMessage;
  }
  if (url.username || url.password) return "The hook URL can't contain a username or password.";
  if (trimmed.includes("#")) return "The hook URL can't contain a fragment (the part after #).";
  if (trimmed.includes("?")) return "Hook URLs can't include a query string.";
  return null;
};

// Never trimmed: the proxy signs with the secret exactly as typed.
export const hookSecretError = (value: string): string | null => {
  if (!value) return "Enter a secret for the hook.";
  if (!/^[\x21-\x7e]+$/.test(value)) {
    return "The hook secret can only use letters, numbers and symbols, with no spaces.";
  }
  if (value.length < MIN_HOOK_SECRET_LENGTH) {
    return `The hook secret must be at least ${MIN_HOOK_SECRET_LENGTH} characters.`;
  }
  if (value.length > MAX_HOOK_SECRET_LENGTH) {
    return `The hook secret can be at most ${MAX_HOOK_SECRET_LENGTH} characters.`;
  }
  return null;
};

export const hookRuleServiceError = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return "Pick or type the service this rule applies to.";
  if (trimmed.length > MAX_HOOK_RULE_SERVICE_LENGTH) {
    return `A service name can be at most ${MAX_HOOK_RULE_SERVICE_LENGTH} characters.`;
  }
  if (!AGENT_VAULT_NO_CONTROL_CHARS_RE.test(trimmed)) return AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE;
  return null;
};

/**
 * A rule as the form edits it. The service type decides which narrowing applies: methods and paths for HTTP, tools for
 * MCP, nothing for the rest. It is null for a name that isn't one of the project's services, such as an inline one.
 */
export type THookRuleDraft = {
  service: string;
  serviceType: AgentVaultServiceType | null;
  methods: AgentVaultHttpMethod[];
  paths: string[];
  pathDraft: string;
  tools: string[];
  toolDraft: string;
};

export const blankHookRule = (): THookRuleDraft => ({
  service: "",
  serviceType: null,
  methods: [...HTTP_METHODS],
  paths: [],
  pathDraft: "",
  tools: [],
  toolDraft: ""
});

// A saved rule's narrowing says which type it was written for, and wins over the named service's type so that editing
// the hook never drops narrowing it was saved with.
export const hookRuleDraftOf = (
  rule: TAgentVaultHookRule,
  serviceType?: AgentVaultServiceType
): THookRuleDraft => {
  let type: AgentVaultServiceType | null = serviceType ?? null;
  if (rule.tools) type = AgentVaultServiceType.Mcp;
  else if (rule.methods || rule.paths) type = AgentVaultServiceType.Http;
  return {
    ...blankHookRule(),
    service: rule.service,
    serviceType: type,
    methods: rule.methods
      ? HTTP_METHODS.filter((m) => rule.methods?.includes(m))
      : [...HTTP_METHODS],
    paths: rule.paths ?? [],
    tools: rule.tools ?? []
  };
};

/** Lists are left out rather than sent empty: the API reads an empty list as a mistake. */
export const buildHookRule = (draft: THookRuleDraft): TAgentVaultHookRule => {
  const service = draft.service.trim();
  if (draft.serviceType === AgentVaultServiceType.Http) {
    return {
      service,
      ...(isAllMethods(draft.methods) || !draft.methods.length ? {} : { methods: draft.methods }),
      ...(draft.paths.length ? { paths: draft.paths } : {})
    };
  }
  if (draft.serviceType === AgentVaultServiceType.Mcp) {
    return { service, ...(draft.tools.length ? { tools: draft.tools } : {}) };
  }
  return { service };
};

const addListIssues = (
  values: string[],
  draft: string,
  validate: (value: string, existing: string[]) => string | null,
  what: string,
  path: (string | number)[],
  ctx: z.RefinementCtx
) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
  if (values.length > MAX_HOOK_RULE_ENTRIES) {
    issue(`A rule can list at most ${MAX_HOOK_RULE_ENTRIES} ${what}.`);
    return;
  }
  const invalid = values
    .map((value, index) => validate(value, values.slice(0, index)))
    .find(Boolean);
  if (invalid) {
    issue(invalid);
    return;
  }
  const trimmedDraft = draft.trim();
  if (trimmedDraft) issue(validate(trimmedDraft, values) ?? `Add "${trimmedDraft}" or clear it.`);
};

const toolError = (tool: string, existing: string[]) =>
  toolNameError(tool) ?? (existing.includes(tool) ? `"${tool}" is listed twice.` : null);

export const hookFormSchema = () =>
  z
    .object({
      name: z
        .string()
        .trim()
        .min(1, "Enter a name for the hook.")
        .pipe(slugSchema({ max: 64, field: "Name" })),
      description: agentVaultDescriptionSchema,
      url: z.string(),
      secret: z.string(),
      rules: z
        .array(z.custom<THookRuleDraft>())
        .max(MAX_HOOK_RULES, `A hook can have at most ${MAX_HOOK_RULES} rules.`)
    })
    .superRefine((data, ctx) => {
      const issue = (path: (string | number)[], message: string) =>
        ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });

      const urlIssue = hookUrlError(data.url);
      if (urlIssue) issue(["url"], urlIssue);
      if (data.secret !== UNCHANGED_SECRET) {
        const secretIssue = hookSecretError(data.secret);
        if (secretIssue) issue(["secret"], secretIssue);
      }

      data.rules.forEach((rule, index) => {
        const serviceIssue = hookRuleServiceError(rule.service);
        if (serviceIssue) issue(["rules", index, "service"], serviceIssue);
        if (rule.serviceType === AgentVaultServiceType.Http) {
          if (!rule.methods.length) {
            issue(["rules", index, "methods"], "Pick at least one method.");
          }
          addListIssues(
            rule.paths,
            rule.pathDraft,
            pathPrefixError,
            "path prefixes",
            ["rules", index, "paths"],
            ctx
          );
        }
        if (rule.serviceType === AgentVaultServiceType.Mcp) {
          addListIssues(
            rule.tools,
            rule.toolDraft,
            toolError,
            "tools",
            ["rules", index, "tools"],
            ctx
          );
        }
      });
    });

export type THookForm = z.infer<ReturnType<typeof hookFormSchema>>;

export const hookFormOf = (
  hook?: TAgentVaultHook | null,
  serviceTypes: Map<string, AgentVaultServiceType> = new Map(),
  initialName = ""
): THookForm => ({
  name: hook?.name ?? initialName,
  description: hook?.description ?? "",
  url: hook?.url ?? "",
  secret: hook ? UNCHANGED_SECRET : "",
  rules: (hook?.rules ?? []).map((rule) => hookRuleDraftOf(rule, serviceTypes.get(rule.service)))
});

export const buildCreateHookRequest = (data: THookForm): TCreateAgentVaultHookDTO => ({
  name: data.name,
  ...(data.description ? { description: data.description } : {}),
  url: data.url.trim(),
  secret: data.secret,
  rules: data.rules.map(buildHookRule)
});

const canonicalRule = (rule: TAgentVaultHookRule) => ({
  service: rule.service,
  methods: rule.methods ?? null,
  paths: rule.paths ?? null,
  tools: rule.tools ?? null
});

const sameRules = (left: TAgentVaultHookRule[], right: TAgentVaultHookRule[]) =>
  JSON.stringify(left.map(canonicalRule)) === JSON.stringify(right.map(canonicalRule));

/**
 * Only what changed is sent. URL, secret and rules changes need the plan's hooks feature, so a rename must not carry
 * them, and the audit log reads every field sent as one the edit touched.
 */
export const buildUpdateHookRequest = (
  hook: TAgentVaultHook,
  data: THookForm
): Omit<TUpdateAgentVaultHookDTO, "hookId"> => {
  const url = data.url.trim();
  const rules = data.rules.map(buildHookRule);
  return {
    ...(data.name !== hook.name ? { name: data.name } : {}),
    ...(data.description !== (hook.description ?? "")
      ? { description: data.description || null }
      : {}),
    ...(url !== hook.url ? { url } : {}),
    ...(data.secret !== UNCHANGED_SECRET ? { secret: data.secret } : {}),
    ...(sameRules(rules, hook.rules) ? {} : { rules })
  };
};

const listSummary = (values: string[], noun: string) =>
  values.length === 1 ? values[0] : `${values.length} ${noun}`;

/** One short line per rule, for tables and session details. */
export const describeHookRule = (rule: TAgentVaultHookRule): string => {
  const parts: string[] = [];
  if (rule.methods) parts.push(rule.methods.join(", "));
  if (rule.paths) parts.push(listSummary(rule.paths, "paths"));
  if (rule.tools) parts.push(listSummary(rule.tools, "tools"));
  return parts.length ? `${rule.service}: ${parts.join(" on ")}` : rule.service;
};
