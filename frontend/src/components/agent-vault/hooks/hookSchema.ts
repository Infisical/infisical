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
  TAgentVaultHookNarrowing,
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
const MAX_HOOK_NARROWING_ENTRIES = 100;

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

/** What a hook checks of its service: methods and paths for HTTP, tools for MCP, nothing for the rest. */
export type THookNarrowingDraft = {
  methods: AgentVaultHttpMethod[];
  paths: string[];
  pathDraft: string;
  tools: string[];
  toolDraft: string;
};

export const blankHookNarrowing = (): THookNarrowingDraft => ({
  methods: [...HTTP_METHODS],
  paths: [],
  pathDraft: "",
  tools: [],
  toolDraft: ""
});

export const hookNarrowingDraftOf = (narrowing: TAgentVaultHookNarrowing): THookNarrowingDraft => ({
  ...blankHookNarrowing(),
  methods: narrowing.methods
    ? HTTP_METHODS.filter((m) => narrowing.methods?.includes(m))
    : [...HTTP_METHODS],
  paths: narrowing.paths ?? [],
  tools: narrowing.tools ?? []
});

/** Lists are left out rather than sent empty: the API reads an empty list as a mistake. */
export const buildHookNarrowing = (
  draft: THookNarrowingDraft,
  serviceType: AgentVaultServiceType | null
): TAgentVaultHookNarrowing => {
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

const addListIssues = (
  values: string[],
  draft: string,
  validate: (value: string, existing: string[]) => string | null,
  what: string,
  path: (string | number)[],
  ctx: z.RefinementCtx
) => {
  const issue = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
  if (values.length > MAX_HOOK_NARROWING_ENTRIES) {
    issue(`A hook can check at most ${MAX_HOOK_NARROWING_ENTRIES} ${what}.`);
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

/** Marks a narrowing the API would refuse on its field under the service form's `hook`. */
export const addHookNarrowingIssues = (
  draft: THookNarrowingDraft,
  serviceType: AgentVaultServiceType | null,
  ctx: z.RefinementCtx
) => {
  const path = ["hook"];
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

// The form rebuilds lists in its own order, so lists compare as sets or an untouched narrowing would read as an edit.
const asSet = (values?: string[]) => (values ? [...values].sort() : null);

export const sameHookNarrowing = (
  left: TAgentVaultHookNarrowing,
  right: TAgentVaultHookNarrowing
) =>
  JSON.stringify([asSet(left.methods), asSet(left.paths), asSet(left.tools)]) ===
  JSON.stringify([asSet(right.methods), asSet(right.paths), asSet(right.tools)]);

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
      secret: z.string()
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
    });

export type THookForm = z.infer<ReturnType<typeof hookFormSchema>>;

export const hookFormOf = (hook?: TAgentVaultHook | null, initialName = ""): THookForm => ({
  name: hook?.name ?? initialName,
  description: hook?.description ?? "",
  url: hook?.url ?? "",
  secret: hook ? UNCHANGED_SECRET : ""
});

export const buildCreateHookRequest = (data: THookForm): TCreateAgentVaultHookDTO => ({
  name: data.name,
  ...(data.description ? { description: data.description } : {}),
  url: data.url.trim(),
  secret: data.secret
});

/**
 * Only what changed is sent. URL and secret changes need the plan's hooks feature, so a rename must not carry them, and
 * the audit log reads every field sent as one the edit touched.
 */
export const buildUpdateHookRequest = (
  hook: TAgentVaultHook,
  data: THookForm
): Omit<TUpdateAgentVaultHookDTO, "hookId"> => {
  const url = data.url.trim();
  return {
    ...(data.name !== hook.name ? { name: data.name } : {}),
    ...(data.description !== (hook.description ?? "")
      ? { description: data.description || null }
      : {}),
    ...(url !== hook.url ? { url } : {}),
    ...(data.secret !== UNCHANGED_SECRET ? { secret: data.secret } : {})
  };
};

const listSummary = (values: string[], noun: string) =>
  values.length === 1 ? values[0] : `${values.length} ${noun}`;

/** One short line for what a hook checks of its service. Null when it checks everything. */
export const describeHookNarrowing = (narrowing: TAgentVaultHookNarrowing): string | null => {
  const parts: string[] = [];
  if (narrowing.methods) parts.push(narrowing.methods.join(", "));
  if (narrowing.paths) parts.push(listSummary(narrowing.paths, "paths"));
  if (narrowing.tools) parts.push(listSummary(narrowing.tools, "tools"));
  return parts.length ? parts.join(" on ") : null;
};

/** Names as a sentence's list, as in "stripe, billing-api and 2 more", naming at most `shown`. */
export const listNames = (names: string[], shown = 3): string => {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length <= shown)
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  // "and 1 more" is no shorter than the name it hides.
  if (names.length === shown + 1)
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return `${names.slice(0, shown).join(", ")} and ${names.length - shown} more`;
};
