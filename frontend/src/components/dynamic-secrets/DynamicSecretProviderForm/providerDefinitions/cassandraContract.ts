import { z } from "zod";

import {
  DynamicSecretProviders,
  TUpdateDynamicSecretDTO
} from "@app/hooks/api/dynamicSecret/types";
import type { VaultDatabaseRole } from "@app/hooks/api/migration/types";

import {
  createDynamicSecretProviderFormSchema,
  DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  editDynamicSecretProviderFormSchema,
  normalizeDynamicSecretUsernameTemplateForCreate,
  normalizeDynamicSecretUsernameTemplateForEdit
} from "../schemas";
import {
  TCreateDynamicSecretProviderDTO,
  TCreateDynamicSecretProviderFormContext,
  TDynamicSecretProviderFormValues,
  TEditDynamicSecretProviderFormContext
} from "../types";

export const CASSANDRA_CUSTOM_RENDERER_REASONS = [
  "conditional-fields",
  "remote-options",
  "import-workflow"
] as const;

export const cassandraCreateInputsSchema = z.object({
  host: z.string().toLowerCase().min(1),
  port: z.coerce.number(),
  keyspace: z.string().optional(),
  localDataCenter: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  creationStatement: z.string().min(1),
  revocationStatement: z.string().min(1),
  renewStatement: z.string().optional(),
  ca: z.string().optional(),
  sslRejectUnauthorized: z.boolean().default(true)
});

export const cassandraEditInputsSchema = cassandraCreateInputsSchema.partial();

export type TCassandraFormInputs = z.input<typeof cassandraCreateInputsSchema>;
export type TCassandraFormValues = TDynamicSecretProviderFormValues<TCassandraFormInputs>;

export const cassandraCreateFormSchema = createDynamicSecretProviderFormSchema(
  cassandraCreateInputsSchema
) as z.ZodType<TCassandraFormValues>;

export const cassandraEditFormSchema = editDynamicSecretProviderFormSchema(
  cassandraEditInputsSchema,
  { usernameTemplateSchema: z.string().trim().nullable().optional() }
) as z.ZodType<TCassandraFormValues>;

export const getCassandraStatements = () => ({
  creationStatement:
    "CREATE ROLE '{{username}}' WITH PASSWORD = '{{password}}' AND LOGIN=true;\nGRANT ALL PERMISSIONS ON ALL KEYSPACES TO '{{username}}';",
  renewStatement: "",
  revocationStatement: 'DROP ROLE "{{username}}";'
});

export const getCassandraCreateDefaultValues = (
  context: TCreateDynamicSecretProviderFormContext
): TCassandraFormValues => ({
  name: "",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment: context.isSingleEnvironmentMode ? context.environments[0] : undefined,
  usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: {
    ...getCassandraStatements(),
    host: "",
    port: 9042,
    keyspace: "",
    localDataCenter: "datacenter1",
    username: "",
    password: "",
    ca: "",
    sslRejectUnauthorized: true
  }
});

export const getCassandraEditDefaultValues = (
  context: TEditDynamicSecretProviderFormContext
): TCassandraFormValues => ({
  name: context.dynamicSecret.name,
  defaultTTL: context.dynamicSecret.defaultTTL,
  maxTTL: context.dynamicSecret.maxTTL,
  usernameTemplate:
    context.dynamicSecret.usernameTemplate || DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: { ...(context.dynamicSecret.inputs as TCassandraFormInputs) }
});

export const getCassandraCreatePayload = (
  values: TCassandraFormValues,
  context: TCreateDynamicSecretProviderFormContext
): TCreateDynamicSecretProviderDTO<DynamicSecretProviders.Cassandra> => ({
  provider: {
    type: DynamicSecretProviders.Cassandra,
    inputs: cassandraCreateInputsSchema.parse(values.inputs)
  },
  maxTTL: values.maxTTL ?? undefined,
  name: values.name,
  path: context.secretPath,
  defaultTTL: values.defaultTTL,
  projectSlug: context.projectSlug,
  environmentSlug: values.environment?.slug ?? "",
  usernameTemplate: normalizeDynamicSecretUsernameTemplateForCreate(values.usernameTemplate)
});

export const getCassandraEditPayload = (
  values: TCassandraFormValues,
  context: TEditDynamicSecretProviderFormContext
): TUpdateDynamicSecretDTO => ({
  name: context.dynamicSecret.name,
  path: context.secretPath,
  projectSlug: context.projectSlug,
  environmentSlug: context.environment,
  data: {
    maxTTL: values.maxTTL || undefined,
    defaultTTL: values.defaultTTL,
    inputs: cassandraEditInputsSchema.parse(values.inputs),
    newName: values.name === context.dynamicSecret.name ? undefined : values.name,
    usernameTemplate: normalizeDynamicSecretUsernameTemplateForEdit(values.usernameTemplate)
  }
});

export const getCassandraVaultImportValues = (role: VaultDatabaseRole) => {
  const connectionString =
    role.config.connection_details.hosts || role.config.connection_details.connection_url || "";
  const hosts: string[] = [];
  let port = 9042;

  connectionString
    .trim()
    .split(",")
    .filter(Boolean)
    .forEach((entry) => {
      const [host, rawPort] = entry.trim().split(":");
      if (host) hosts.push(host);
      if (rawPort && !Number.isNaN(Number.parseInt(rawPort, 10))) {
        port = Number.parseInt(rawPort, 10);
      }
    });

  const convertVariables = (statement: string) =>
    statement.replace(/\{\{name\}\}/g, "{{username}}");

  return {
    name: role.name,
    defaultTTL: role.default_ttl ? `${role.default_ttl}s` : undefined,
    maxTTL: role.max_ttl ? `${role.max_ttl}s` : undefined,
    inputs: {
      host: hosts.length ? hosts.join(",") : undefined,
      port,
      username: role.config.connection_details.username || undefined,
      ca: role.config.connection_details.tls_ca || undefined,
      creationStatement: role.creation_statements?.length
        ? role.creation_statements.map(convertVariables).join("\n")
        : undefined,
      revocationStatement: role.revocation_statements?.length
        ? role.revocation_statements.map(convertVariables).join("\n")
        : undefined,
      renewStatement: role.renew_statements?.length
        ? role.renew_statements.map(convertVariables).join("\n")
        : undefined
    }
  };
};
