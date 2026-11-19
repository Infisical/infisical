import * as x509 from "@peculiar/x509";
import RE2 from "re2";
import { z } from "zod";

import type { TResolvedNativeTarget } from "../agent-vault-proxy/agent-vault-proxy-types";
import { hasLoneSurrogate } from "./agent-vault-credential-schemas";
import { AgentVaultServiceType } from "./agent-vault-enums";

export const AGENT_VAULT_NATIVE_SERVICE_TYPES = [
  AgentVaultServiceType.Postgres,
  AgentVaultServiceType.Mysql,
  AgentVaultServiceType.Ssh
] as const;

export type TAgentVaultNativeServiceType = (typeof AGENT_VAULT_NATIVE_SERVICE_TYPES)[number];

export const isNativeServiceType = (type: string): type is TAgentVaultNativeServiceType =>
  (AGENT_VAULT_NATIVE_SERVICE_TYPES as readonly string[]).includes(type);

// The CONNECT host the CLI sends is `<name>.svc.agent-vault`, and the proxy refuses a DNS label over 63 bytes.
export const AGENT_VAULT_MAX_NATIVE_SERVICE_NAME_LENGTH = 63;

export const AGENT_VAULT_NATIVE_DEFAULT_PORTS: Record<TAgentVaultNativeServiceType, number> = {
  [AgentVaultServiceType.Postgres]: 5432,
  [AgentVaultServiceType.Mysql]: 3306,
  [AgentVaultServiceType.Ssh]: 22
};

export const AGENT_VAULT_NATIVE_MAX_HOST_LENGTH = 253;
// Postgres caps a database name at 63 bytes and MySQL at 64 characters.
export const AGENT_VAULT_NATIVE_MAX_DATABASE_LENGTH = 64;
export const AGENT_VAULT_NATIVE_MAX_CA_LENGTH = 16384;

export const AGENT_VAULT_NATIVE_MESSAGES = {
  hostRequired: "Enter the server's host name or IP address.",
  hostTooLong: `The host can be at most ${AGENT_VAULT_NATIVE_MAX_HOST_LENGTH} characters.`,
  hostVariable: "Variables aren't supported in the host yet. Enter the host itself.",
  portWhole: "The port must be a whole number.",
  portRange: "The port must be between 1 and 65535.",
  databaseRequired: "Enter the database to connect to.",
  databaseTooLong: `The database name can be at most ${AGENT_VAULT_NATIVE_MAX_DATABASE_LENGTH} characters.`,
  databaseControlChars: "The database name can't contain control characters.",
  databaseInvalidText: "The database name contains invalid text. Type the name rather than pasting it.",
  databaseVariable: "Variables aren't supported in the database name yet. Enter the name itself.",
  caTooLong: `The certificate authority can be at most ${AGENT_VAULT_NATIVE_MAX_CA_LENGTH} characters.`,
  caInvalid:
    "The certificate authority isn't a valid PEM certificate. Paste the CA certificate, starting with -----BEGIN CERTIFICATE-----.",
  caInvalidText: "The certificate authority contains invalid text. Copy the CA certificate from its file again.",
  caNotOnlyCertificates:
    "Paste only the CA certificate. This text also contains a private key or other data that isn't a certificate."
} as const;

// Underscores are allowed because Docker Compose service names use them and Go's resolver accepts them.
const HOSTNAME_RE = new RE2(/^[a-z0-9_](?:[a-z0-9_-]*[a-z0-9_])?(?:\.[a-z0-9_](?:[a-z0-9_-]*[a-z0-9_])?)*$/i);
const IPV6_SCHEMA = z.string().ip({ version: "v6" });
// eslint-disable-next-line no-control-regex
const NO_CONTROL_CHARS_RE = new RE2(/^[^\x00-\x1f\x7f]*$/);
// A PEM spans lines, so only those control characters are allowed. config is plaintext jsonb, which rejects a NUL.
// eslint-disable-next-line no-control-regex
const PEM_CONTROL_CHARS_RE = new RE2(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/);
const PEM_BLOCK_RE = new RE2(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
const PEM_BEGIN_RE = new RE2(/-----BEGIN /g);

const nativeHostSchema = z
  .string()
  .trim()
  .min(1, AGENT_VAULT_NATIVE_MESSAGES.hostRequired)
  .max(AGENT_VAULT_NATIVE_MAX_HOST_LENGTH, AGENT_VAULT_NATIVE_MESSAGES.hostTooLong)
  .transform((raw) => {
    const unbracketed = raw.startsWith("[") && raw.endsWith("]") ? raw.slice(1, -1) : raw;
    return unbracketed.replace(/\.$/, "").toLowerCase();
  })
  .superRefine((host, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    if (!NO_CONTROL_CHARS_RE.test(host)) return fail("The host can't contain spaces or control characters.");
    if (host.includes("{{")) return fail(AGENT_VAULT_NATIVE_MESSAGES.hostVariable);
    if (IPV6_SCHEMA.safeParse(host).success) return;
    if (host.includes("://")) return fail("Enter only the host, without a scheme such as postgres://.");
    if (host.includes("/")) return fail("Enter only the host, without a path.");
    if (host.includes("*")) return fail("Enter one specific host. Wildcards aren't supported here.");
    if (host.includes(":")) return fail("Enter the port in the Port field, not as part of the host.");
    if (!HOSTNAME_RE.test(host)) fail(`"${host}" isn't a valid host name or IP address.`);
  });

const nativePortSchema = (fallback: number) =>
  z.coerce
    .number()
    .int(AGENT_VAULT_NATIVE_MESSAGES.portWhole)
    .min(1, AGENT_VAULT_NATIVE_MESSAGES.portRange)
    .max(65535, AGENT_VAULT_NATIVE_MESSAGES.portRange)
    .default(fallback);

const nativeDatabaseSchema = z
  .string()
  .trim()
  .min(1, AGENT_VAULT_NATIVE_MESSAGES.databaseRequired)
  .max(AGENT_VAULT_NATIVE_MAX_DATABASE_LENGTH, AGENT_VAULT_NATIVE_MESSAGES.databaseTooLong)
  .refine((value) => !hasLoneSurrogate(value), AGENT_VAULT_NATIVE_MESSAGES.databaseInvalidText)
  .refine((value) => NO_CONTROL_CHARS_RE.test(value), AGENT_VAULT_NATIVE_MESSAGES.databaseControlChars)
  .refine((value) => !value.includes("{{"), AGENT_VAULT_NATIVE_MESSAGES.databaseVariable);

const certificateAuthoritySchema = z
  .string()
  .trim()
  .max(AGENT_VAULT_NATIVE_MAX_CA_LENGTH, AGENT_VAULT_NATIVE_MESSAGES.caTooLong)
  .superRefine((pem, ctx) => {
    if (!pem) return;
    const fail = (message: string = AGENT_VAULT_NATIVE_MESSAGES.caInvalid) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    if (hasLoneSurrogate(pem)) return fail(AGENT_VAULT_NATIVE_MESSAGES.caInvalidText);
    if (PEM_CONTROL_CHARS_RE.test(pem)) return fail();
    const blocks = pem.match(PEM_BLOCK_RE);
    if (!blocks?.length) return fail();
    // Every Read member and every proxy gets the CA, so a private key pasted along with it must not be stored.
    if ((pem.match(PEM_BEGIN_RE) ?? []).length !== blocks.length) {
      return fail(AGENT_VAULT_NATIVE_MESSAGES.caNotOnlyCertificates);
    }
    try {
      blocks.forEach((block) => new x509.X509Certificate(block));
    } catch {
      fail();
    }
  })
  .transform((pem) => pem.match(PEM_BLOCK_RE)?.join("\n") || undefined);

const nativeTlsSchema = z
  .object({
    enabled: z.boolean().default(true),
    verify: z.boolean().default(true),
    ca: certificateAuthoritySchema.optional()
  })
  .default({});

export const AgentVaultPostgresServiceConfigSchema = z.object({
  host: nativeHostSchema,
  port: nativePortSchema(AGENT_VAULT_NATIVE_DEFAULT_PORTS[AgentVaultServiceType.Postgres]),
  database: nativeDatabaseSchema,
  tls: nativeTlsSchema
});

export const AgentVaultMysqlServiceConfigSchema = z.object({
  host: nativeHostSchema,
  port: nativePortSchema(AGENT_VAULT_NATIVE_DEFAULT_PORTS[AgentVaultServiceType.Mysql]),
  database: nativeDatabaseSchema,
  tls: nativeTlsSchema
});

export const AgentVaultSshServiceConfigSchema = z.object({
  host: nativeHostSchema,
  port: nativePortSchema(AGENT_VAULT_NATIVE_DEFAULT_PORTS[AgentVaultServiceType.Ssh])
});

export type TAgentVaultNativeTls = z.infer<typeof nativeTlsSchema>;

export type TAgentVaultNativeServiceConfig = {
  host: string;
  port: number;
  database?: string;
  tls?: TAgentVaultNativeTls;
};

// A request clears a stored CA with `ca: null`, which the config schema reads as an empty value.
export const toNativeTlsConfigInput = (
  tls: { enabled?: boolean; verify?: boolean; ca?: string | null } | undefined
): { enabled?: boolean; verify?: boolean; ca?: string } | undefined =>
  tls && { ...tls, ca: tls.ca === null ? "" : tls.ca };

export type TAgentVaultNativeTlsCaChange = "set" | "removed" | "replaced";

const storedCaOf = (config: unknown) => {
  const ca = (config as TAgentVaultNativeServiceConfig | null)?.tls?.ca;
  return ca ? ca.replace(/\s+/g, "") : null;
};

// Line endings and indentation don't change which CA is trusted, so a re-pasted copy of the same PEM isn't reported.
export const describeNativeTlsCaChange = (
  storedConfig: unknown,
  nextConfig: unknown
): TAgentVaultNativeTlsCaChange | undefined => {
  const stored = storedCaOf(storedConfig);
  const next = storedCaOf(nextConfig);
  if (stored === next) return undefined;
  if (!stored) return "set";
  if (!next) return "removed";
  return "replaced";
};

// Only what the proxy needs to reach the server: config may also hold fields of other types, which stay off the wire.
export const toResolvedNativeTarget = (type: string, config: unknown): TResolvedNativeTarget | null => {
  if (!isNativeServiceType(type)) return null;
  const { host, port, database, tls } = (config ?? {}) as TAgentVaultNativeServiceConfig;
  return {
    host,
    port,
    database: database ?? null,
    tls: tls ? { enabled: tls.enabled, verify: tls.verify, ca: tls.ca ?? null } : null
  };
};
