import { createPrivateKey, KeyObject, X509Certificate } from "node:crypto";

import RE2 from "re2";
import { z } from "zod";

import { BadRequestError } from "@app/lib/errors";

import type {
  TAgentVaultOauthConfig,
  TAgentVaultOauthMemberConfig,
  TAgentVaultOauthVariableCredentialConfig
} from "../agent-vault-oauth/agent-vault-oauth-types";
import { AgentVaultCredentialType } from "./agent-vault-enums";

// credentialConfig is plaintext jsonb, read on the list page without a decrypt; encryptedCredential is
// the KMS-sealed secret, NULL exactly when the type is passthrough. The discriminator is a column with a
// CHECK constraint, so a new credential type needs a migration that widens it.

// The characters RFC 7230 allows. Go's HTTP client refuses to send anything else, so a name saved
// without this check 502s every request through the service.
export const AGENT_VAULT_HEADER_NAME_RE = new RE2(/^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/);

export const AGENT_VAULT_HEADER_NAME_MESSAGE =
  "A header name can't contain spaces or colons. Use letters, digits and dashes, as in X-API-Key.";

// A NUL is rejected by the jsonb write and 500s; a CR or LF saves fine and then makes Go refuse to send
// the header, so the credential silently never goes out. Both usually arrive by pasting.
// eslint-disable-next-line no-control-regex
export const AGENT_VAULT_NO_CONTROL_CHARS_RE = new RE2(/^[^\x00-\x1f\x7f]*$/);

export const AGENT_VAULT_NO_CONTROL_CHARS_MESSAGE =
  "This can't contain line breaks or other control characters. Check for a stray newline if you pasted it.";

// jsonb refuses a lone surrogate and the write 500s. RE2 reads one as U+FFFD, so the regex checks can't see it.
export const hasLoneSurrogate = (value: string) => !value.isWellFormed();

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

// The username, key and certificate are sealed; the plaintext half only says whether a certificate is stored.
export const AgentVaultSshKeyConfigSchema = z.object({ hasCertificate: z.boolean() });

export const AGENT_VAULT_SSH_KEY_MAX_LENGTH = 8192;

export const AgentVaultClientCertificateConfigSchema = z.object({ notAfter: z.string() });

export const AgentVaultDynamicSecretConfigSchema = z.object({
  dynamicSecretId: z.string().uuid(),
  projectId: z.string(),
  environment: z.string(),
  secretPath: z.string(),
  name: z.string()
});

export type TAgentVaultDynamicSecretConfig = z.infer<typeof AgentVaultDynamicSecretConfigSchema>;

export const AGENT_VAULT_CLIENT_CERTIFICATE_MAX_LENGTH = 16384;
export const AGENT_VAULT_CLIENT_CERTIFICATE_KEY_MAX_LENGTH = 8192;

export const AGENT_VAULT_CLIENT_CERTIFICATE_MESSAGES = {
  certificateInvalid:
    "The certificate isn't a valid PEM certificate. Paste the client certificate, starting with -----BEGIN CERTIFICATE-----, followed by any intermediate certificates.",
  certificateNotOnlyCertificates:
    "Paste only certificates in 'certificate'. This text also contains a private key or other data that isn't a certificate; put the private key in 'privateKey'.",
  privateKeyInvalid:
    "The private key isn't a valid PEM private key. Paste the key file's contents, starting with -----BEGIN PRIVATE KEY----- (or RSA PRIVATE KEY or EC PRIVATE KEY).",
  privateKeyEncrypted:
    "The private key is encrypted with a passphrase, which Agent Vault can't use. Decrypt it first, for example with 'openssl pkey -in key.pem -out key-decrypted.pem', and paste the result.",
  privateKeyNotOnlyKey:
    "Paste only the private key in 'privateKey'. This text also contains a certificate or other data; put the certificates in 'certificate'.",
  keyMismatch:
    "The private key doesn't match the certificate. The first certificate in 'certificate' must be the client certificate issued for this key.",
  variable:
    "A client certificate credential can't use variables, so its certificate and key can't contain double braces, as in {{CLIENT_CERT}}. Paste the values themselves.",
  invalidText: "This contains invalid text. Copy the certificate and key from their files again.",
  needsBoth:
    "A client certificate credential needs both 'certificate' and 'privateKey', which are replaced together. Send both, or leave both out to keep the stored ones."
} as const;

export const AgentVaultCredentialConfigSchema = z.discriminatedUnion("type", [
  z.object({ ...AgentVaultBearerConfigFields, type: z.literal(AgentVaultCredentialType.Bearer) }),
  AgentVaultBasicConfigSchema.extend({ type: z.literal(AgentVaultCredentialType.Basic) }),
  AgentVaultPassthroughConfigSchema.extend({ type: z.literal(AgentVaultCredentialType.Passthrough) }),
  AgentVaultSshKeyConfigSchema.extend({ type: z.literal(AgentVaultCredentialType.SshKey) }),
  AgentVaultClientCertificateConfigSchema.extend({ type: z.literal(AgentVaultCredentialType.ClientCertificate) }),
  AgentVaultDynamicSecretConfigSchema.extend({ type: z.literal(AgentVaultCredentialType.DynamicSecret) })
]);

// OAuth's config is written whole from a completed authorization (or, when each member signs in, from discovery) and
// patched by refresh, never parsed from a request, so it has a type rather than a schema.
export type TAgentVaultCredentialConfig =
  | z.infer<typeof AgentVaultCredentialConfigSchema>
  | TAgentVaultOauthConfig
  | TAgentVaultOauthMemberConfig
  | TAgentVaultOauthVariableCredentialConfig;

export const AgentVaultSecretSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal(AgentVaultCredentialType.Bearer), value: z.string().min(1).max(8192) }),
  z.object({
    type: z.literal(AgentVaultCredentialType.Basic),
    username: z.string().max(256),
    password: z.string().max(8192)
  }),
  z.object({
    type: z.literal(AgentVaultCredentialType.SshKey),
    username: z.string().min(1).max(256),
    privateKey: z.string().min(1).max(AGENT_VAULT_SSH_KEY_MAX_LENGTH),
    certificate: z.string().max(AGENT_VAULT_SSH_KEY_MAX_LENGTH).optional()
  }),
  z.object({
    type: z.literal(AgentVaultCredentialType.ClientCertificate),
    certificate: z.string().min(1).max(AGENT_VAULT_CLIENT_CERTIFICATE_MAX_LENGTH),
    privateKey: z.string().min(1).max(AGENT_VAULT_CLIENT_CERTIFICATE_KEY_MAX_LENGTH)
  })
]);

export type TAgentVaultSecret = z.infer<typeof AgentVaultSecretSchema>;

const PEM_CERTIFICATE_BLOCK_RE = new RE2(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
const PEM_PRIVATE_KEY_BLOCK_RE = new RE2(
  /-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----/g
);
const PEM_ANY_BEGIN_RE = new RE2(/-----BEGIN /g);

export const parseClientCertificate = (input: {
  certificate: string;
  privateKey: string;
}): { certificate: string; privateKey: string; notAfter: string } => {
  const refuse = (message: string) => new BadRequestError({ message });
  const certificateText = input.certificate.trim();
  const keyText = input.privateKey.trim();
  if ([certificateText, keyText].some(hasLoneSurrogate))
    throw refuse(AGENT_VAULT_CLIENT_CERTIFICATE_MESSAGES.invalidText);
  if ([certificateText, keyText].some((text) => text.includes("{{"))) {
    throw refuse(AGENT_VAULT_CLIENT_CERTIFICATE_MESSAGES.variable);
  }

  const certificateBlocks = certificateText.match(PEM_CERTIFICATE_BLOCK_RE) ?? [];
  if (certificateBlocks.length && (certificateText.match(PEM_ANY_BEGIN_RE) ?? []).length !== certificateBlocks.length) {
    throw refuse(AGENT_VAULT_CLIENT_CERTIFICATE_MESSAGES.certificateNotOnlyCertificates);
  }
  let leaf: X509Certificate | undefined;
  try {
    [leaf] = certificateBlocks.map((block) => new X509Certificate(block));
  } catch {
    throw refuse(AGENT_VAULT_CLIENT_CERTIFICATE_MESSAGES.certificateInvalid);
  }
  if (!leaf) throw refuse(AGENT_VAULT_CLIENT_CERTIFICATE_MESSAGES.certificateInvalid);

  const [keyBlock, ...otherKeyBlocks] = keyText.match(PEM_PRIVATE_KEY_BLOCK_RE) ?? [];
  if (!keyBlock || otherKeyBlocks.length) throw refuse(AGENT_VAULT_CLIENT_CERTIFICATE_MESSAGES.privateKeyInvalid);
  if ((keyText.match(PEM_ANY_BEGIN_RE) ?? []).length !== 1) {
    throw refuse(AGENT_VAULT_CLIENT_CERTIFICATE_MESSAGES.privateKeyNotOnlyKey);
  }
  if (keyBlock.startsWith("-----BEGIN ENCRYPTED") || keyBlock.includes("Proc-Type: 4,ENCRYPTED")) {
    throw refuse(AGENT_VAULT_CLIENT_CERTIFICATE_MESSAGES.privateKeyEncrypted);
  }
  let key: KeyObject;
  try {
    key = createPrivateKey({ key: keyBlock, format: "pem" });
  } catch {
    throw refuse(AGENT_VAULT_CLIENT_CERTIFICATE_MESSAGES.privateKeyInvalid);
  }

  if (!leaf.checkPrivateKey(key)) throw refuse(AGENT_VAULT_CLIENT_CERTIFICATE_MESSAGES.keyMismatch);

  return {
    certificate: `${certificateBlocks.join("\n")}\n`,
    privateKey: `${keyBlock}\n`,
    notAfter: new Date(leaf.validTo).toISOString()
  };
};
