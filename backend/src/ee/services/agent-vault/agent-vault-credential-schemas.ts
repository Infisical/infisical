import { z } from "zod";

import { AgentVaultCredentialType } from "./agent-vault-enums";

// Two halves per credential type, and the split is the point:
//
//   credentialConfig  plaintext jsonb, non-secret. The connections table reads `Bearer · DD-API-KEY`
//                     straight off it with no decrypt, which is why it is a column and not part of the
//                     encrypted blob.
//   encryptedCredential  the secret, KMS-sealed with the project cipher. NULL exactly when the type is
//                        passthrough.
//
// The discriminator is a column, not a field inside the blob, so adding OAuth2 or SigV4 later is a
// config entry and needs no migration. PAM put its discriminator inside the blob and now carries
// withLegacyAuthMethod and normalizeCredentialAuthMethod to cope.

export const AgentVaultBearerConfigSchema = z.object({
  headerName: z.string().trim().min(1).max(128).default("Authorization"),
  // Stored exactly as typed, with no trailing space: the proxy joins prefix and value with one space and
  // skips the space when the prefix is empty. That is how `DD-API-KEY: abc123` and
  // `Authorization: Bearer abc123` both come out right.
  headerPrefix: z.string().trim().max(64).default("Bearer")
});

// RFC 7617 lets either half be blank, and real services use that: Stripe and Postmark authenticate
// with the key as the username and no password at all.
export const AgentVaultBasicConfigSchema = z.object({
  username: z.string().trim().max(256),
  // Whether, never what. Kept in the plaintext half so a read path can say "no password" without a
  // decrypt, and so clearing a username can be refused when nothing would be left to authenticate with.
  hasPassword: z.boolean()
});

export const AgentVaultPassthroughConfigSchema = z.object({});

export const AgentVaultCredentialConfigSchema = z.discriminatedUnion("type", [
  AgentVaultBearerConfigSchema.extend({ type: z.literal(AgentVaultCredentialType.Bearer) }),
  AgentVaultBasicConfigSchema.extend({ type: z.literal(AgentVaultCredentialType.Basic) }),
  AgentVaultPassthroughConfigSchema.extend({ type: z.literal(AgentVaultCredentialType.Passthrough) })
]);

export type TAgentVaultCredentialConfig = z.infer<typeof AgentVaultCredentialConfigSchema>;

// The secret half, as it is sealed. Present on write for bearer and basic, so there is no
// half-configured connection and the proxy never has a refusal path. Basic may seal an empty
// password; bearer may not, because a header with nothing after the prefix authenticates nobody.
export const AgentVaultSecretSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal(AgentVaultCredentialType.Bearer), value: z.string().min(1).max(8192) }),
  z.object({ type: z.literal(AgentVaultCredentialType.Basic), password: z.string().max(8192) })
]);

export type TAgentVaultSecret = z.infer<typeof AgentVaultSecretSchema>;
