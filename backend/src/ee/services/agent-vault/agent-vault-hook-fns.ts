import RE2 from "re2";
import { z } from "zod";

import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { BadRequestError } from "@app/lib/errors";

import {
  AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE,
  AGENT_VAULT_NO_CONTROL_CHARS_RE,
  hasLoneSurrogate
} from "./agent-vault-credential-schemas";

export const AGENT_VAULT_MAX_HOOK_URL_LENGTH = 2048;
export const AGENT_VAULT_MIN_HOOK_SECRET_LENGTH = 32;
export const AGENT_VAULT_MAX_HOOK_SECRET_LENGTH = 512;

export const AGENT_VAULT_HOOKS_NOT_ON_PLAN_MESSAGE =
  "Hooks aren't included in your plan, so they can't be added or changed. Existing hooks keep working. Upgrade to add one.";
export const AGENT_VAULT_HOOK_SIGNING_SECRET_REQUIRED_MESSAGE = "Enter a signing secret for the hook.";
export const AGENT_VAULT_HOOK_CHANGED_DURING_SAVE_MESSAGE =
  "This service's hook was changed by another save while this one was in progress. Reload the service and save again.";

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
export const AgentVaultHookSigningSecretSchema = z.string().superRefine((value, ctx) => {
  let message: string | undefined;
  if (!value) message = AGENT_VAULT_HOOK_SIGNING_SECRET_REQUIRED_MESSAGE;
  // Some RE2 builds match a lone surrogate against an ASCII class, so it is checked on its own.
  else if (!HOOK_SECRET_RE.test(value) || hasLoneSurrogate(value)) {
    message = "The signing secret can only use letters, numbers and symbols, with no spaces.";
  } else if (value.length < AGENT_VAULT_MIN_HOOK_SECRET_LENGTH) {
    message = `The signing secret must be at least ${AGENT_VAULT_MIN_HOOK_SECRET_LENGTH} characters.`;
  } else if (value.length > AGENT_VAULT_MAX_HOOK_SECRET_LENGTH) {
    message = `The signing secret can be at most ${AGENT_VAULT_MAX_HOOK_SECRET_LENGTH} characters.`;
  }
  if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
});

export type TAgentVaultHookInput = { url: string; signingSecret: string };
export type TAgentVaultHookUpdate = { url: string; signingSecret?: string };
export type TAgentVaultHookChange =
  | { kind: "set"; url: string; signingSecret: string }
  | { kind: "updated"; url: string; signingSecret?: string }
  | { kind: "removed" };
export type TAgentVaultHookAudit = {
  hookChanged: "set" | "removed" | "updated";
  hookUrl?: string;
  hookSecretReplaced: boolean;
};

export const classifyHookUpdate = (
  sent: TAgentVaultHookUpdate | null | undefined,
  storedHookUrl: string | null | undefined
): TAgentVaultHookChange | undefined => {
  if (sent === undefined) return undefined;
  if (sent === null) return storedHookUrl ? { kind: "removed" } : undefined;
  if (!storedHookUrl) {
    if (sent.signingSecret === undefined) {
      throw new BadRequestError({ message: AGENT_VAULT_HOOK_SIGNING_SECRET_REQUIRED_MESSAGE });
    }
    return { kind: "set", url: sent.url, signingSecret: sent.signingSecret };
  }
  if (sent.url === storedHookUrl && sent.signingSecret === undefined) return undefined;
  return { kind: "updated", url: sent.url, signingSecret: sent.signingSecret };
};

export const describeHookChange = (
  change: TAgentVaultHookChange,
  lockedHookUrl: string | null | undefined
): TAgentVaultHookAudit => {
  if (change.kind === "set") return { hookChanged: "set", hookUrl: change.url, hookSecretReplaced: true };
  if (change.kind === "removed") {
    return { hookChanged: "removed", hookUrl: lockedHookUrl ?? undefined, hookSecretReplaced: false };
  }
  return {
    hookChanged: "updated",
    hookUrl: change.url !== lockedHookUrl ? change.url : undefined,
    hookSecretReplaced: change.signingSecret !== undefined
  };
};

export const assertAgentVaultHooksOnPlan = async (
  licenseService: Pick<TLicenseServiceFactory, "getPlan">,
  orgId: string
) => {
  const plan = await licenseService.getPlan(orgId);
  if (!plan.agentVaultHooks) throw new BadRequestError({ message: AGENT_VAULT_HOOKS_NOT_ON_PLAN_MESSAGE });
};
