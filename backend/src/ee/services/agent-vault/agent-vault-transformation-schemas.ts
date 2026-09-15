import { z } from "zod";

import { AGENT_VAULT } from "@app/lib/api-docs";

import {
  AGENT_VAULT_HEADER_NAME_MESSAGE,
  AGENT_VAULT_HEADER_NAME_RE,
  AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE,
  AGENT_VAULT_NO_CONTROL_CHARS_RE
} from "./agent-vault-credential-schemas";
import { AgentVaultSubstitutionSurface } from "./agent-vault-enums";

export const AGENT_VAULT_MAX_CUSTOM_HEADERS = 20;
export const AGENT_VAULT_MAX_SUBSTITUTIONS = 20;

// The proxy sets these itself, or strips them as hop-by-hop. Letting a service name one would either be
// silently dropped on the way out or corrupt the request, and neither failure says why.
const RESERVED_HEADER_NAMES = new Set([
  "host",
  "content-length",
  "transfer-encoding",
  "connection",
  "proxy-connection",
  "upgrade",
  "te",
  "trailer",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization"
]);

export const AGENT_VAULT_RESERVED_HEADER_MESSAGE = "This header is set by the proxy and can't be overridden.";

// Shared with the bearer credential's own header name, which is set on the request the same way and so
// has the same reserved names. Written once because it drifted when it was written twice: the credential
// copy never grew the reserved check, so a credential could sit on Content-Length while a custom header
// could not.
export const agentVaultHeaderNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(AGENT_VAULT_HEADER_NAME_RE, AGENT_VAULT_HEADER_NAME_MESSAGE)
  .refine((name) => !RESERVED_HEADER_NAMES.has(name.toLowerCase()), AGENT_VAULT_RESERVED_HEADER_MESSAGE);

const headerPrefixSchema = z
  .string()
  .trim()
  .max(64)
  .regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE);

const secretValueSchema = z
  .string()
  .min(1)
  .max(8192)
  .regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE);

// No minimum length. The swap is a plain find-and-replace, so a short placeholder over-matches, but that
// is the author's own doing and visible the first time a request goes out wrong.
const placeholderSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(AGENT_VAULT_NO_CONTROL_CHARS_RE, AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE);

const surfacesSchema = z
  .array(z.nativeEnum(AgentVaultSubstitutionSurface))
  .min(1, "Pick at least one place to look for the placeholder.")
  .max(Object.keys(AgentVaultSubstitutionSurface).length)
  .transform((surfaces) => [...new Set(surfaces)]);

// A row is resolved to a stored one by `id` when the caller sends one, and otherwise by its name (headers)
// or placeholder (substitutions), both of which are unique per service. That is what lets a hand-written
// API call edit one header without first fetching the service for its row ids. `value` is therefore
// optional on update: omitting it keeps whatever is sealed, and a row that resolves to nothing needs one.
export const AgentVaultCustomHeaderInputSchema = z.object({
  name: agentVaultHeaderNameSchema.describe(AGENT_VAULT.SERVICE.customHeaderName),
  prefix: headerPrefixSchema.optional().describe(AGENT_VAULT.SERVICE.customHeaderPrefix),
  value: secretValueSchema.describe(AGENT_VAULT.SERVICE.customHeaderValue)
});

export const AgentVaultCustomHeaderUpdateSchema = z.object({
  id: z.string().uuid().optional().describe(AGENT_VAULT.SERVICE.headerId),
  name: agentVaultHeaderNameSchema.describe(AGENT_VAULT.SERVICE.customHeaderName),
  prefix: headerPrefixSchema.optional().describe(AGENT_VAULT.SERVICE.updateCustomHeaderPrefix),
  value: secretValueSchema.optional().describe(AGENT_VAULT.SERVICE.updateCustomHeaderValue)
});

export const AgentVaultSubstitutionInputSchema = z.object({
  placeholder: placeholderSchema.describe(AGENT_VAULT.SERVICE.placeholder),
  surfaces: surfacesSchema.describe(AGENT_VAULT.SERVICE.surfaces),
  value: secretValueSchema.describe(AGENT_VAULT.SERVICE.substitutionValue)
});

export const AgentVaultSubstitutionUpdateSchema = z.object({
  id: z.string().uuid().optional().describe(AGENT_VAULT.SERVICE.substitutionId),
  placeholder: placeholderSchema.describe(AGENT_VAULT.SERVICE.placeholder),
  surfaces: surfacesSchema.describe(AGENT_VAULT.SERVICE.surfaces),
  value: secretValueSchema.optional().describe(AGENT_VAULT.SERVICE.updateSubstitutionValue)
});

type TNamed = { name: string };
type TPlaceheld = { placeholder: string };

// Custom header names collide case-insensitively because that is how the proxy sets them; placeholders are
// matched literally, so they collide exactly. Both are what the update path resolves rows by, so a
// duplicate here would make "which stored row did the caller mean" unanswerable.
export const addDuplicateCustomHeaderNameIssues = (headers: TNamed[], ctx: z.RefinementCtx) => {
  const seen = new Set<string>();
  headers.forEach((header, index) => {
    const key = header.name.toLowerCase();
    if (seen.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `The custom header "${header.name}" is listed twice.`,
        path: [index, "name"]
      });
    }
    seen.add(key);
  });
};

export const addDuplicatePlaceholderIssues = (substitutions: TPlaceheld[], ctx: z.RefinementCtx) => {
  const seen = new Set<string>();
  substitutions.forEach((substitution, index) => {
    if (seen.has(substitution.placeholder)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `The placeholder "${substitution.placeholder}" is listed twice.`,
        path: [index, "placeholder"]
      });
    }
    seen.add(substitution.placeholder);
  });
};

export type TAgentVaultCustomHeaderInput = z.infer<typeof AgentVaultCustomHeaderInputSchema>;
export type TAgentVaultCustomHeaderUpdate = z.infer<typeof AgentVaultCustomHeaderUpdateSchema>;
export type TAgentVaultSubstitutionInput = z.infer<typeof AgentVaultSubstitutionInputSchema>;
export type TAgentVaultSubstitutionUpdate = z.infer<typeof AgentVaultSubstitutionUpdateSchema>;
