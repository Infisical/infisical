import * as x509 from "@peculiar/x509";
import RE2 from "re2";
import { z } from "zod";

import type { TResolvedNativeTarget } from "../agent-vault-proxy/agent-vault-proxy-types";
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

const MAX_HOST_LENGTH = 253;
// Postgres caps a database name at 63 bytes and MySQL at 64 characters.
const MAX_DATABASE_LENGTH = 64;
const MAX_CA_LENGTH = 16384;

const HOSTNAME_RE = new RE2(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/i);
const IPV6_SCHEMA = z.string().ip({ version: "v6" });
// eslint-disable-next-line no-control-regex
const NO_CONTROL_CHARS_RE = new RE2(/^[^\x00-\x1f\x7f]*$/);
// A PEM spans lines, so only those control characters are allowed. config is plaintext jsonb, which rejects a NUL.
// eslint-disable-next-line no-control-regex
const PEM_CONTROL_CHARS_RE = new RE2(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/);
const PEM_BLOCK_RE = new RE2(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);

const nativeHostSchema = z
  .string()
  .trim()
  .min(1, "Enter the server's host name or IP address.")
  .max(MAX_HOST_LENGTH, `The host can be at most ${MAX_HOST_LENGTH} characters.`)
  .transform((raw) => {
    const unbracketed = raw.startsWith("[") && raw.endsWith("]") ? raw.slice(1, -1) : raw;
    return unbracketed.replace(/\.$/, "").toLowerCase();
  })
  .superRefine((host, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    if (!NO_CONTROL_CHARS_RE.test(host)) return fail("The host can't contain spaces or control characters.");
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
    .int("The port must be a whole number.")
    .min(1, "The port must be between 1 and 65535.")
    .max(65535, "The port must be between 1 and 65535.")
    .default(fallback);

const nativeDatabaseSchema = z
  .string()
  .trim()
  .min(1, "Enter the database to connect to.")
  .max(MAX_DATABASE_LENGTH, `The database name can be at most ${MAX_DATABASE_LENGTH} characters.`)
  .refine((value) => NO_CONTROL_CHARS_RE.test(value), "The database name can't contain control characters.");

const certificateAuthoritySchema = z
  .string()
  .trim()
  .max(MAX_CA_LENGTH, `The certificate authority can be at most ${MAX_CA_LENGTH} characters.`)
  .superRefine((pem, ctx) => {
    if (!pem) return;
    const fail = () =>
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "The certificate authority isn't a valid PEM certificate. Paste the CA certificate, starting with -----BEGIN CERTIFICATE-----."
      });
    if (PEM_CONTROL_CHARS_RE.test(pem)) return fail();
    const blocks = pem.match(PEM_BLOCK_RE);
    if (!blocks?.length) return fail();
    try {
      blocks.forEach((block) => new x509.X509Certificate(block));
    } catch {
      fail();
    }
  })
  .transform((pem) => pem || undefined);

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
