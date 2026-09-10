import { z } from "zod";

import { AgentVaultCredentialType } from "./agent-vault-enums";

// credentialConfig is plaintext jsonb, read on the list page without a decrypt; encryptedCredential is
// the KMS-sealed secret, NULL exactly when the type is passthrough. The discriminator is a column rather
// than a field inside the blob, so a new credential type needs no migration.

// The characters RFC 7230 allows. Go's HTTP client refuses to send anything else, so a name saved
// without this check 502s every request through the connection.
export const AGENT_VAULT_HEADER_NAME_RE = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;

export const AGENT_VAULT_HEADER_NAME_MESSAGE =
  "A header name can't contain spaces or colons. Use letters, digits and dashes, as in X-API-Key.";

// A NUL is rejected by the jsonb write and 500s; a CR or LF saves fine and then makes Go refuse to send
// the header, so the credential silently never goes out. Both usually arrive by pasting.
// eslint-disable-next-line no-control-regex
export const AGENT_VAULT_NO_CONTROL_CHARS_RE = /^[^\x00-\x1f\x7f]*$/;

export const AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE =
  "This can't contain line breaks or other control characters. Check for a stray newline if you pasted it.";

const AGENT_VAULT_DEFAULT_HEADER_NAME = "Authorization";
const AGENT_VAULT_DEFAULT_HEADER_PREFIX = "Bearer";

const bearerHeaderName = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(AGENT_VAULT_HEADER_NAME_RE, AGENT_VAULT_HEADER_NAME_MESSAGE);

// The shape a stored bearer config has, where both halves are already settled.
export const AgentVaultBearerConfigFields = {
  headerName: bearerHeaderName.default(AGENT_VAULT_DEFAULT_HEADER_NAME),
  headerPrefix: z.string().trim().max(64).default("")
};

// Bearer is the scheme RFC 6750 defines for Authorization, so the two settle together on the way in.
// Naming another header leaves that scheme behind, and filling one in there would send a word the
// caller never asked for.
export const AgentVaultBearerConfigSchema = z
  .object({
    headerName: bearerHeaderName.default(AGENT_VAULT_DEFAULT_HEADER_NAME),
    headerPrefix: z.string().trim().max(64).optional()
  })
  .transform(({ headerName, headerPrefix }) => ({
    headerName,
    headerPrefix:
      headerPrefix ??
      (headerName.toLowerCase() === AGENT_VAULT_DEFAULT_HEADER_NAME.toLowerCase()
        ? AGENT_VAULT_DEFAULT_HEADER_PREFIX
        : "")
  }));

// Nothing plaintext: the username is sealed with the password, since for some services (Stripe, Postmark)
// the username is the key.
export const AgentVaultBasicConfigSchema = z.object({});

export const AgentVaultPassthroughConfigSchema = z.object({});

export const AgentVaultCredentialConfigSchema = z.discriminatedUnion("type", [
  z.object({ ...AgentVaultBearerConfigFields, type: z.literal(AgentVaultCredentialType.Bearer) }),
  AgentVaultBasicConfigSchema.extend({ type: z.literal(AgentVaultCredentialType.Basic) }),
  AgentVaultPassthroughConfigSchema.extend({ type: z.literal(AgentVaultCredentialType.Passthrough) })
]);

export type TAgentVaultCredentialConfig = z.infer<typeof AgentVaultCredentialConfigSchema>;

export const AgentVaultSecretSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal(AgentVaultCredentialType.Bearer), value: z.string().min(1).max(8192) }),
  z.object({
    type: z.literal(AgentVaultCredentialType.Basic),
    username: z.string().max(256),
    password: z.string().max(8192)
  })
]);

export type TAgentVaultSecret = z.infer<typeof AgentVaultSecretSchema>;
