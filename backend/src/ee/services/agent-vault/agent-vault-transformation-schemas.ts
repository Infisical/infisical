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

// Set by the proxy or stripped as hop-by-hop, so naming one is silently dropped or corrupts the request.
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

// Shared with the bearer credential's own header name: both end up on the request the same way, so both
// have the same reserved names.
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

// No minimum length: a short placeholder over-matches, but that is the author's own doing.
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

// Rows resolve by `id` and otherwise by name or placeholder, so a hand-written call can edit one without
// fetching the service first. `value` is optional on update because omitting it keeps what is sealed.
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

// Header names collide case-insensitively, placeholders exactly, matching how each is used. A duplicate
// would make "which stored row did the caller mean" unanswerable.
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
