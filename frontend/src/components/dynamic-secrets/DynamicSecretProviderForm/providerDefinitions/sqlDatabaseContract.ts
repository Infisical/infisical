import type { FieldValues } from "react-hook-form";
import { z } from "zod";

import {
  DynamicSecretProviders,
  SqlProviders,
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
import type {
  TCreateDynamicSecretProviderDTO,
  TCreateDynamicSecretProviderFormContext,
  TDynamicSecretProviderFormMode,
  TDynamicSecretProviderFormValues,
  TEditDynamicSecretProviderFormContext
} from "../types";

export type TSqlPasswordRequirements = {
  length: number;
  required: {
    lowercase: number;
    uppercase: number;
    digits: number;
    symbols: number;
  };
  allowedSymbols?: string;
};

export type TSqlDatabaseInputs = {
  client?: SqlProviders;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  passwordRequirements?: TSqlPasswordRequirements;
  creationStatement?: string;
  revocationStatement?: string;
  renewStatement?: string;
  sslEnabled?: boolean;
  ca?: string;
  sslRejectUnauthorized?: boolean;
  gatewayId?: string | null;
  gatewayPoolId?: string | null;
};

export type TSqlDatabaseFormValues = TDynamicSecretProviderFormValues<TSqlDatabaseInputs> &
  FieldValues & {
    metadata?: { key: string; value: string }[];
  };

export const sqlPasswordRequirementsSchema = z
  .object({
    length: z.number().min(1).max(250),
    required: z
      .object({
        lowercase: z.number().min(0),
        uppercase: z.number().min(0),
        digits: z.number().min(0),
        symbols: z.number().min(0)
      })
      .refine(
        (required) => Object.values(required).reduce((sum, count) => sum + count, 0) <= 250,
        "Sum of required characters cannot exceed 250"
      ),
    allowedSymbols: z.string().optional()
  })
  .refine(
    ({ length, required }) =>
      Object.values(required).reduce((sum, count) => sum + count, 0) <= length,
    "Sum of required characters cannot exceed the total length"
  );

const metadataSchema = z
  .array(
    z.object({
      key: z.string().trim().min(1),
      value: z.string().trim().default("")
    })
  )
  .optional();

export const sqlDatabaseCreateInputsSchema = z.object({
  client: z.nativeEnum(SqlProviders),
  host: z.string().toLowerCase().min(1),
  port: z.coerce.number(),
  database: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  passwordRequirements: sqlPasswordRequirementsSchema.optional(),
  creationStatement: z.string().min(1),
  revocationStatement: z.string().min(1),
  renewStatement: z.string().optional(),
  sslEnabled: z.boolean().optional(),
  ca: z.string().optional(),
  sslRejectUnauthorized: z.boolean().default(true),
  gatewayId: z.string().optional(),
  gatewayPoolId: z.string().optional()
});

export const sqlDatabaseEditInputsSchema = z
  .object({
    client: z.nativeEnum(SqlProviders),
    host: z.string().toLowerCase().min(1),
    port: z.number(),
    database: z.string().min(1),
    username: z.string().min(1),
    password: z.string().min(1),
    passwordRequirements: sqlPasswordRequirementsSchema.optional(),
    creationStatement: z.string().min(1),
    revocationStatement: z.string().min(1),
    renewStatement: z.string().optional(),
    sslEnabled: z.boolean().optional(),
    ca: z.string().optional(),
    sslRejectUnauthorized: z.boolean().optional(),
    gatewayId: z.string().optional().nullable(),
    gatewayPoolId: z.string().optional().nullable()
  })
  .partial();

export const sqlDatabaseCreateFormSchema = createDynamicSecretProviderFormSchema(
  sqlDatabaseCreateInputsSchema
).extend({ metadata: metadataSchema }) as z.ZodType<TSqlDatabaseFormValues>;

export const sqlDatabaseEditFormSchema = editDynamicSecretProviderFormSchema(
  sqlDatabaseEditInputsSchema,
  { usernameTemplateSchema: z.string().trim().nullable().optional() }
).extend({ metadata: metadataSchema }) as z.ZodType<TSqlDatabaseFormValues>;

export const getSqlStatements = (provider: SqlProviders) => {
  if (provider === SqlProviders.MySql) {
    return {
      creationStatement:
        "CREATE USER \"{{username}}\"@'%' IDENTIFIED BY '{{password}}';\nGRANT ALL ON \"{{database}}\".* TO \"{{username}}\"@'%';",
      renewStatement: "",
      revocationStatement:
        'REVOKE ALL PRIVILEGES ON "{{database}}".* FROM "{{username}}"@\'%\';\nDROP USER "{{username}}"@\'%\';'
    };
  }

  if (provider === SqlProviders.Oracle) {
    return {
      creationStatement:
        'CREATE USER "{{username}}" IDENTIFIED BY "{{password}}";\nGRANT CONNECT TO "{{username}}";\nGRANT CREATE SESSION TO "{{username}}";',
      renewStatement: "",
      revocationStatement:
        'REVOKE CONNECT FROM "{{username}}";\nREVOKE CREATE SESSION FROM "{{username}}";\nDROP USER "{{username}}";'
    };
  }

  if (provider === SqlProviders.MsSQL) {
    return {
      creationStatement:
        "CREATE LOGIN [{{username}}] WITH PASSWORD =  '{{password}}';\nCREATE USER [{{username}}] FOR LOGIN [{{username}}];\nGRANT SELECT, INSERT, UPDATE, DELETE ON SCHEMA::dbo TO [{{username}}];",
      renewStatement: "",
      revocationStatement: "DROP USER [{{username}}];\nDROP LOGIN [{{username}}];"
    };
  }

  return {
    creationStatement:
      "CREATE USER \"{{username}}\" WITH ENCRYPTED PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';\nGRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO \"{{username}}\";",
    renewStatement: "ALTER ROLE \"{{username}}\" VALID UNTIL '{{expiration}}';",
    revocationStatement:
      'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM "{{username}}";\nDROP ROLE "{{username}}";'
  };
};

export const getSqlDefaultPort = (provider: SqlProviders) => {
  switch (provider) {
    case SqlProviders.MySql:
      return 3306;
    case SqlProviders.Oracle:
      return 1521;
    case SqlProviders.MsSQL:
      return 1433;
    default:
      return 5432;
  }
};

export const getDefaultSqlPasswordRequirements = (
  provider: SqlProviders
): TSqlPasswordRequirements => ({
  length: provider === SqlProviders.Oracle ? 30 : 48,
  required: { lowercase: 1, uppercase: 1, digits: 1, symbols: 0 },
  allowedSymbols: "-_.~!*"
});

export const getSqlClientResetValues = (provider: SqlProviders) => ({
  ...getSqlStatements(provider),
  port: getSqlDefaultPort(provider),
  passwordLength: getDefaultSqlPasswordRequirements(provider).length
});

export const normalizeSqlGatewayValueForMode = (
  mode: TDynamicSecretProviderFormMode,
  value: string | null
) => (mode === "create" ? (value ?? undefined) : value);

export const getSqlDatabaseCreateDefaultValues = (
  context: TCreateDynamicSecretProviderFormContext
): TSqlDatabaseFormValues => ({
  name: "",
  defaultTTL: "1h",
  maxTTL: "24h",
  environment: context.isSingleEnvironmentMode ? context.environments[0] : undefined,
  metadata: [],
  usernameTemplate: DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
  inputs: {
    client: SqlProviders.Postgres,
    host: "",
    port: getSqlDefaultPort(SqlProviders.Postgres),
    database: "default",
    username: "",
    password: "",
    ...getSqlStatements(SqlProviders.Postgres),
    sslRejectUnauthorized: true,
    gatewayId: undefined,
    gatewayPoolId: undefined,
    passwordRequirements: getDefaultSqlPasswordRequirements(SqlProviders.Postgres)
  }
});

export const getSqlDatabaseEditDefaultValues = (
  context: TEditDynamicSecretProviderFormContext
): TSqlDatabaseFormValues => {
  const inputs = context.dynamicSecret.inputs as TSqlDatabaseInputs;
  const client = inputs.client ?? SqlProviders.Postgres;

  return {
    name: context.dynamicSecret.name,
    defaultTTL: context.dynamicSecret.defaultTTL,
    maxTTL: context.dynamicSecret.maxTTL,
    metadata: context.dynamicSecret.metadata,
    usernameTemplate:
      context.dynamicSecret.usernameTemplate || DEFAULT_DYNAMIC_SECRET_USERNAME_TEMPLATE,
    inputs: {
      ...inputs,
      passwordRequirements: inputs.passwordRequirements ?? getDefaultSqlPasswordRequirements(client)
    }
  };
};

export const getSqlDatabaseCreatePayload = (
  values: TSqlDatabaseFormValues,
  context: TCreateDynamicSecretProviderFormContext
): TCreateDynamicSecretProviderDTO<DynamicSecretProviders.SqlDatabase> => {
  const inputs = sqlDatabaseCreateInputsSchema.parse(values.inputs);

  return {
    provider: { type: DynamicSecretProviders.SqlDatabase, inputs },
    maxTTL: values.maxTTL ?? undefined,
    name: values.name,
    path: context.secretPath,
    defaultTTL: values.defaultTTL,
    projectSlug: context.projectSlug,
    environmentSlug: values.environment?.slug ?? "",
    metadata: values.metadata,
    usernameTemplate: normalizeDynamicSecretUsernameTemplateForCreate(values.usernameTemplate)
  };
};

export const getSqlDatabaseEditPayload = (
  values: TSqlDatabaseFormValues,
  context: TEditDynamicSecretProviderFormContext
): TUpdateDynamicSecretDTO => {
  const inputs = sqlDatabaseEditInputsSchema.parse(values.inputs);

  return {
    name: context.dynamicSecret.name,
    path: context.secretPath,
    projectSlug: context.projectSlug,
    environmentSlug: context.environment,
    data: {
      maxTTL: values.maxTTL || undefined,
      defaultTTL: values.defaultTTL,
      inputs: {
        ...inputs,
        gatewayId: inputs.gatewayId ?? null,
        gatewayPoolId: inputs.gatewayPoolId ?? null
      },
      newName: values.name === context.dynamicSecret.name ? undefined : values.name,
      metadata: values.metadata,
      usernameTemplate: normalizeDynamicSecretUsernameTemplateForEdit(values.usernameTemplate)
    }
  };
};

const getSqlProviderFromVaultPlugin = (pluginName?: string) => {
  const normalizedPluginName = pluginName?.toLowerCase() ?? "";
  if (normalizedPluginName.includes("mysql")) return SqlProviders.MySql;
  if (normalizedPluginName.includes("oracle")) return SqlProviders.Oracle;
  if (normalizedPluginName.includes("mssql")) return SqlProviders.MsSQL;
  return SqlProviders.Postgres;
};

const convertVaultVariables = (statement: string) =>
  statement.replace(/\{\{name\}\}/g, "{{username}}");

export const getSqlDatabaseVaultImportValues = (role: VaultDatabaseRole) => {
  const client = getSqlProviderFromVaultPlugin(role.config.plugin_name);
  const inputs: Partial<TSqlDatabaseInputs> = { client };
  const connectionUrl = role.config.connection_details.connection_url ?? "";
  let connectionUrlParseFailed = false;

  try {
    const trimmedUrl = connectionUrl.trim();
    if (!trimmedUrl) throw new Error("Empty URL");

    const setConnectionDetails = (host: string, port: number | undefined, database: string) => {
      if (host) inputs.host = host;
      const parsedPort = port ?? getSqlDefaultPort(client);
      inputs.port = Number.isNaN(parsedPort) ? getSqlDefaultPort(client) : parsedPort;
      if (database) inputs.database = database;
    };
    const parseStandardUrl = (url: URL, dbFromParams?: string) => {
      if (url.username) inputs.username = url.username;
      const port = url.port ? parseInt(url.port, 10) : undefined;
      setConnectionDetails(url.hostname, port, dbFromParams || url.pathname.replace(/^\//, ""));
    };

    if (client === SqlProviders.MySql) {
      const tcpMatch = trimmedUrl.match(/@tcp\(([^:]+):?(\d+)?\)\/([^?#]+)/);
      if (tcpMatch) {
        setConnectionDetails(
          tcpMatch[1],
          tcpMatch[2] ? parseInt(tcpMatch[2], 10) : undefined,
          tcpMatch[3]
        );
      } else if (trimmedUrl.includes("://")) {
        parseStandardUrl(new URL(trimmedUrl));
      }
    } else if (client === SqlProviders.Oracle) {
      const oracleMatch = trimmedUrl.match(/@(?:\/\/)?([^:/]+):?(\d+)?\/(.+)/);
      if (oracleMatch) {
        setConnectionDetails(
          oracleMatch[1],
          oracleMatch[2] ? parseInt(oracleMatch[2], 10) : undefined,
          oracleMatch[3]
        );
      }
    } else if (client === SqlProviders.MsSQL) {
      const url = new URL(trimmedUrl);
      parseStandardUrl(
        url,
        url.searchParams.get("database") || url.searchParams.get("databaseName") || ""
      );
    } else {
      parseStandardUrl(new URL(trimmedUrl));
    }
  } catch {
    connectionUrlParseFailed = true;
  }

  if (role.config.connection_details.username) {
    inputs.username = role.config.connection_details.username;
  }
  if (role.config.connection_details.tls_ca) inputs.ca = role.config.connection_details.tls_ca;
  if (role.creation_statements?.length) {
    inputs.creationStatement = role.creation_statements.map(convertVaultVariables).join("\n");
  }
  if (role.revocation_statements?.length) {
    inputs.revocationStatement = role.revocation_statements.map(convertVaultVariables).join("\n");
  }
  if (role.renew_statements?.length) {
    inputs.renewStatement = role.renew_statements.map(convertVaultVariables).join("\n");
  }

  return {
    name: role.name,
    defaultTTL: role.default_ttl ? `${role.default_ttl}s` : undefined,
    maxTTL: role.max_ttl ? `${role.max_ttl}s` : undefined,
    inputs,
    connectionUrlParseFailed
  };
};
