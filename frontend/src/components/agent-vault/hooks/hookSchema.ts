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
  TAgentVaultHookRuleInput,
  TAgentVaultHookRuleNarrowing,
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

/** What a hook checks of one service: methods and paths for HTTP, tools for MCP, nothing for the rest. */
export type THookNarrowingDraft = {
  methods: AgentVaultHttpMethod[];
  paths: string[];
  pathDraft: string;
  tools: string[];
  toolDraft: string;
};

/**
 * A rule as the form edits it: one of the project's services by name. Its type decides which narrowing applies, and is
 * null only while no service is picked.
 */
export type THookRuleDraft = THookNarrowingDraft & {
  service: string;
  serviceType: AgentVaultServiceType | null;
};

export const blankHookNarrowing = (): THookNarrowingDraft => ({
  methods: [...HTTP_METHODS],
  paths: [],
  pathDraft: "",
  tools: [],
  toolDraft: ""
});

export const blankHookRule = (): THookRuleDraft => ({
  ...blankHookNarrowing(),
  service: "",
  serviceType: null
});

export const hookNarrowingDraftOf = (
  narrowing: TAgentVaultHookRuleNarrowing
): THookNarrowingDraft => ({
  ...blankHookNarrowing(),
  methods: narrowing.methods
    ? HTTP_METHODS.filter((m) => narrowing.methods?.includes(m))
    : [...HTTP_METHODS],
  paths: narrowing.paths ?? [],
  tools: narrowing.tools ?? []
});

// A rule on a service missing from the picker's first page takes its type from the narrowing it was saved with.
export const hookRuleDraftOf = (
  rule: TAgentVaultHookRule,
  serviceType?: AgentVaultServiceType
): THookRuleDraft => {
  let type: AgentVaultServiceType | null = serviceType ?? null;
  if (!type && rule.tools) type = AgentVaultServiceType.Mcp;
  else if (!type && (rule.methods || rule.paths)) type = AgentVaultServiceType.Http;
  return { ...hookNarrowingDraftOf(rule), service: rule.service, serviceType: type };
};

/** Lists are left out rather than sent empty: the API reads an empty list as a mistake. */
export const buildHookNarrowing = (
  draft: THookNarrowingDraft,
  serviceType: AgentVaultServiceType | null
): TAgentVaultHookRuleNarrowing => {
  if (serviceType === AgentVaultServiceType.Http) {
    return {
      ...(isAllMethods(draft.methods) || !draft.methods.length ? {} : { methods: draft.methods }),
      ...(draft.paths.length ? { paths: draft.paths } : {})
    };
  }
  if (serviceType === AgentVaultServiceType.Mcp) {
    return draft.tools.length ? { tools: draft.tools } : {};
  }
  return {};
};

export const buildHookRule = (draft: THookRuleDraft): TAgentVaultHookRuleInput => ({
  service: draft.service,
  ...buildHookNarrowing(draft, draft.serviceType)
});

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

/** Marks a narrowing the API would refuse on its field, under `path` (a rule's or a service's hook entry). */
export const addHookNarrowingIssues = (
  draft: THookNarrowingDraft,
  serviceType: AgentVaultServiceType | null,
  path: (string | number)[],
  ctx: z.RefinementCtx
) => {
  if (serviceType === AgentVaultServiceType.Http) {
    if (!draft.methods.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, "methods"],
        message: "Pick at least one method."
      });
    }
    addListIssues(
      draft.paths,
      draft.pathDraft,
      pathPrefixError,
      "path prefixes",
      [...path, "paths"],
      ctx
    );
  }
  if (serviceType === AgentVaultServiceType.Mcp) {
    addListIssues(draft.tools, draft.toolDraft, toolError, "tools", [...path, "tools"], ctx);
  }
};

// The form rebuilds lists in its own order, so lists compare as sets or an untouched rule would read as an edit.
const asSet = (values?: string[]) => (values ? [...values].sort() : null);

export const sameHookNarrowing = (
  left: TAgentVaultHookRuleNarrowing,
  right: TAgentVaultHookRuleNarrowing
) =>
  JSON.stringify([asSet(left.methods), asSet(left.paths), asSet(left.tools)]) ===
  JSON.stringify([asSet(right.methods), asSet(right.paths), asSet(right.tools)]);

const sameRules = (left: TAgentVaultHookRuleInput[], right: TAgentVaultHookRule[]) =>
  left.length === right.length &&
  left.every(
    (rule, index) => rule.service === right[index].service && sameHookNarrowing(rule, right[index])
  );

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

      const seen = new Set<string>();
      data.rules.forEach((rule, index) => {
        if (!rule.service)
          issue(["rules", index, "service"], "Pick the service this rule applies to.");
        else if (seen.has(rule.service)) {
          issue(
            ["rules", index, "service"],
            "This service already has a rule. Put all its methods, paths or tools in that one."
          );
        }
        seen.add(rule.service);
        addHookNarrowingIssues(rule, rule.serviceType, ["rules", index], ctx);
      });
    });

export type THookForm = z.infer<ReturnType<typeof hookFormSchema>>;

/** `serviceTypes` holds the project's services' types by name. */
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

/** One short line for what a hook checks of a service, for tables and session details. */
export const describeHookNarrowing = (narrowing: TAgentVaultHookRuleNarrowing): string | null => {
  const parts: string[] = [];
  if (narrowing.methods) parts.push(narrowing.methods.join(", "));
  if (narrowing.paths) parts.push(listSummary(narrowing.paths, "paths"));
  if (narrowing.tools) parts.push(listSummary(narrowing.tools, "tools"));
  return parts.length ? parts.join(" on ") : null;
};

/** One short line per rule, for tables and session details. */
export const describeHookRule = (rule: TAgentVaultHookRule): string => {
  const narrowing = describeHookNarrowing(rule);
  return narrowing ? `${rule.service}: ${narrowing}` : rule.service;
};
