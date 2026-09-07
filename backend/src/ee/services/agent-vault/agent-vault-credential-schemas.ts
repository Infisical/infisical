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

export const AgentVaultBearerConfigSchema = z.object({
  headerName: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(AGENT_VAULT_HEADER_NAME_RE, AGENT_VAULT_HEADER_NAME_MESSAGE)
    .default("Authorization"),
  headerPrefix: z.string().trim().max(64).default("Bearer")
});

// Nothing plaintext: the username is sealed with the password, since for some services (Stripe, Postmark)
// the username is the key.
export const AgentVaultBasicConfigSchema = z.object({});

export const AgentVaultPassthroughConfigSchema = z.object({});

export const AgentVaultCredentialConfigSchema = z.discriminatedUnion("type", [
  AgentVaultBearerConfigSchema.extend({ type: z.literal(AgentVaultCredentialType.Bearer) }),
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
