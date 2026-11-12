import { z } from "zod";

import { isValidEmail } from "@app/helpers/email";
import {
  SMB_DOMAIN_REGEX,
  SMB_HOSTNAME_REGEX,
  SMB_USERNAME_REGEX,
  SMB_VALIDATION_LIMITS,
  validateSmbPassword
} from "@app/helpers/smb";
import { DistinguishedNameRegex, UserPrincipalNameRegex } from "@app/helpers/string";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { ChefConnectionMethod } from "@app/hooks/api/appConnections/types/chef-connection";
import { ClickHouseConnectionMethod } from "@app/hooks/api/appConnections/types/clickhouse-connection";
import {
  DatabricksConnectionMethod,
  DatabricksConnectionScope
} from "@app/hooks/api/appConnections/types/databricks-connection";
import { HCVaultConnectionMethod } from "@app/hooks/api/appConnections/types/hc-vault-connection";
import { JiraConnectionMethod } from "@app/hooks/api/appConnections/types/jira-connection";
import { KeeperConnectionMethod } from "@app/hooks/api/appConnections/types/keeper-connection";
import {
  LdapConnectionMethod,
  LdapConnectionProvider
} from "@app/hooks/api/appConnections/types/ldap-connection";
import { MongoDBConnectionMethod } from "@app/hooks/api/appConnections/types/mongodb-connection";
import { MsSqlConnectionMethod } from "@app/hooks/api/appConnections/types/mssql-connection";
import { MySqlConnectionMethod } from "@app/hooks/api/appConnections/types/mysql-connection";
import { OracleDBConnectionMethod } from "@app/hooks/api/appConnections/types/oracledb-connection";
import { PowerDnsConnectionMethod } from "@app/hooks/api/appConnections/types/powerdns-connection";
import { RedisConnectionMethod } from "@app/hooks/api/appConnections/types/redis-connection";
import { ServiceNowConnectionMethod } from "@app/hooks/api/appConnections/types/servicenow-connection";
import { SmbConnectionMethod } from "@app/hooks/api/appConnections/types/smb-connection";
import { SnowflakeConnectionMethod } from "@app/hooks/api/appConnections/types/snowflake-connection";
import { SshConnectionMethod } from "@app/hooks/api/appConnections/types/ssh-connection";
import { WinRMConnectionMethod } from "@app/hooks/api/appConnections/types/winrm-connection";

import {
  BaseSqlUsernameAndPasswordConnectionSchema,
  genericAppConnectionFieldsSchema
} from "./base";

const msSqlRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.MsSql),
  isPlatformManagedCredentials: z.boolean().optional()
});

export const msSqlConnectionFormSchema = z.discriminatedUnion("method", [
  msSqlRootSchema.extend({
    method: z.literal(MsSqlConnectionMethod.UsernameAndPassword),
    credentials: BaseSqlUsernameAndPasswordConnectionSchema
  })
]);

const mySqlRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.MySql),
  isPlatformManagedCredentials: z.boolean().optional()
});

export const mySqlConnectionFormSchema = z.discriminatedUnion("method", [
  mySqlRootSchema.extend({
    method: z.literal(MySqlConnectionMethod.UsernameAndPassword),
    credentials: BaseSqlUsernameAndPasswordConnectionSchema
  })
]);

const oracleDBRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.OracleDB),
  isPlatformManagedCredentials: z.boolean().optional()
});

export const oracleDBConnectionFormSchema = z.discriminatedUnion("method", [
  oracleDBRootSchema.extend({
    method: z.literal(OracleDBConnectionMethod.UsernameAndPassword),
    credentials: BaseSqlUsernameAndPasswordConnectionSchema
  })
]);

const clickHouseRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.ClickHouse)
});

export const clickHouseConnectionFormSchema = z.discriminatedUnion("method", [
  clickHouseRootSchema.extend({
    method: z.literal(ClickHouseConnectionMethod.UsernameAndPassword),
    credentials: BaseSqlUsernameAndPasswordConnectionSchema
  })
]);

const redisRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Redis)
});

export const redisConnectionFormSchema = z.discriminatedUnion("method", [
  redisRootSchema.extend({
    method: z.literal(RedisConnectionMethod.UsernameAndPassword),
    credentials: z.object({
      host: z.string().trim().min(1, "Host required"),
      port: z.coerce.number().default(6379),
      username: z.string().trim().min(1, "Username required"),
      password: z.string().trim().optional(),
      sslEnabled: z.boolean().default(false),
      sslRejectUnauthorized: z.boolean().default(true),
      sslCertificate: z
        .string()
        .trim()
        .transform((value) => value || undefined)
        .optional()
    })
  })
]);

const mongoDBRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.MongoDB)
});

export const mongoDBConnectionFormSchema = z.discriminatedUnion("method", [
  mongoDBRootSchema.extend({
    method: z.literal(MongoDBConnectionMethod.UsernameAndPassword),
    credentials: z.object({
      host: z.string().trim().min(1, "Host required"),
      port: z.coerce.number().default(27017),
      username: z.string().trim().min(1, "Username required"),
      password: z.string().trim().min(1, "Password required"),
      database: z.string().trim().min(1, "Database required"),
      tlsEnabled: z.boolean().default(false),
      tlsRejectUnauthorized: z.boolean().default(true),
      tlsCertificate: z
        .string()
        .trim()
        .transform((value) => value || undefined)
        .optional()
    })
  })
]);

const snowflakeRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Snowflake)
});

export const snowflakeConnectionFormSchema = z.discriminatedUnion("method", [
  snowflakeRootSchema.extend({
    method: z.literal(SnowflakeConnectionMethod.UsernameAndToken),
    credentials: z.object({
      account: z.string().trim().min(1, "Account required"),
      username: z.string().trim().min(1, "Username required"),
      password: z.string().trim().min(1, "Programmatic Access Token required")
    })
  })
]);

const ldapRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.LDAP)
});

export const ldapConnectionFormSchema = z.discriminatedUnion("method", [
  ldapRootSchema.extend({
    method: z.literal(LdapConnectionMethod.SimpleBind),
    credentials: z.object({
      provider: z.nativeEnum(LdapConnectionProvider),
      url: z
        .string()
        .regex(/^ldaps?:\/\//, 'Must start with "ldaps://" or "ldap://"')
        .url()
        .trim()
        .min(1, "LDAP URL required"),
      dn: z
        .string()
        .trim()
        .min(1, "DN/UPN required")
        .refine(
          (value) => DistinguishedNameRegex.test(value) || UserPrincipalNameRegex.test(value),
          {
            message: "Invalid DN/UPN format"
          }
        ),
      password: z.string().trim().min(1, "Password required"),
      sslRejectUnauthorized: z.boolean(),
      sslCertificate: z
        .string()
        .trim()
        .transform((value) => value || undefined)
        .optional()
    })
  })
]);

const sshConfigurationSchema = z.object({
  blockedUsers: z.string().trim().optional()
});

const sshRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.SSH),
  configuration: sshConfigurationSchema.optional()
});

export const sshConnectionFormSchema = z.discriminatedUnion("method", [
  sshRootSchema.extend({
    method: z.literal(SshConnectionMethod.Password),
    credentials: z.object({
      host: z.string().trim().min(1, "Host required"),
      port: z.coerce.number().int().min(1).max(65535, "Port must be between 1 and 65535"),
      username: z.string().trim().min(1, "Username required"),
      password: z.string().trim().min(1, "Password required")
    })
  }),
  sshRootSchema.extend({
    method: z.literal(SshConnectionMethod.SshKey),
    credentials: z.object({
      host: z.string().trim().min(1, "Host required"),
      port: z.coerce.number().int().min(1).max(65535, "Port must be between 1 and 65535"),
      username: z.string().trim().min(1, "Username required"),
      privateKey: z.string().trim().min(1, "Private key required"),
      passphrase: z.string().trim().optional()
    })
  })
]);

export const smbConnectionFormSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.SMB),
  method: z.literal(SmbConnectionMethod.Credentials),
  credentials: z.object({
    host: z
      .string()
      .trim()
      .min(1, "Host required")
      .max(SMB_VALIDATION_LIMITS.MAX_HOST_LENGTH, "Host too long")
      .refine((val) => SMB_HOSTNAME_REGEX.test(val), {
        message: "Host can only contain alphanumeric characters, dots, and hyphens"
      })
      .refine((val) => !val.startsWith("-") && !val.startsWith("."), {
        message: "Host cannot start with a hyphen or period"
      }),
    port: z.coerce.number().int().min(1).max(65535, "Port must be between 1 and 65535"),
    domain: z
      .string()
      .trim()
      .max(SMB_VALIDATION_LIMITS.MAX_DOMAIN_LENGTH, "Domain too long")
      .refine((val) => val === "" || SMB_DOMAIN_REGEX.test(val), {
        message: "Domain can only contain alphanumeric characters, dots, hyphens, and underscores"
      })
      .refine((val) => val === "" || (!val.startsWith("-") && !val.startsWith(".")), {
        message: "Domain cannot start with a hyphen or period"
      })
      .optional(),
    username: z
      .string()
      .trim()
      .min(1, "Username required")
      .max(SMB_VALIDATION_LIMITS.MAX_ADMIN_USERNAME_LENGTH, "Username too long")
      .refine((val) => SMB_USERNAME_REGEX.test(val), {
        message:
          "Username can only contain alphanumeric characters, underscores, hyphens, and periods"
      })
      .refine((val) => !val.startsWith("-") && !val.startsWith(".") && !val.endsWith("."), {
        message: "Username cannot start with a hyphen or period, and cannot end with a period"
      }),
    password: z
      .string()
      .min(1, "Password required")
      .refine((val) => validateSmbPassword(val), {
        message: "Password cannot contain: semicolons, spaces, quotes, or pipes"
      })
  })
});

const winRMRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.WinRM)
});

export const winRMConnectionFormSchema = z
  .discriminatedUnion("method", [
    winRMRootSchema.extend({
      method: z.literal(WinRMConnectionMethod.UsernamePassword),
      credentials: z.object({
        host: z.string().trim().min(1, "Host required"),
        port: z.coerce.number().int().min(1).max(65535),
        username: z.string().trim().min(1, "Username required"),
        password: z.string().min(1, "Password required"),
        sslEnabled: z.boolean(),
        sslRejectUnauthorized: z.boolean(),
        sslCertificate: z.string().optional()
      })
    })
  ])
  .superRefine((data, ctx) => {
    if (!data.gatewayId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Gateway required",
        path: ["gatewayId"]
      });
    }
  });

const hcVaultRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.HCVault)
});

const hcVaultInstanceUrlSchema = z
  .string()
  .trim()
  .min(1, "Instance URL required")
  .url("Invalid Instance URL");

const hcVaultNamespaceSchema = z.string().trim().optional();

export const hcVaultConnectionFormSchema = z.discriminatedUnion("method", [
  hcVaultRootSchema.extend({
    method: z.literal(HCVaultConnectionMethod.AccessToken),
    credentials: z.object({
      instanceUrl: hcVaultInstanceUrlSchema,
      namespace: hcVaultNamespaceSchema,
      accessToken: z.string().trim().min(1, "Access Token required")
    })
  }),
  hcVaultRootSchema.extend({
    method: z.literal(HCVaultConnectionMethod.AppRole),
    credentials: z.object({
      instanceUrl: hcVaultInstanceUrlSchema,
      namespace: hcVaultNamespaceSchema,
      roleId: z.string().trim().min(1, "Role ID required"),
      secretId: z.string().trim().min(1, "Secret ID required")
    })
  })
]);

const chefRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Chef)
});

export const chefConnectionFormSchema = z.discriminatedUnion("method", [
  chefRootSchema.extend({
    method: z.literal(ChefConnectionMethod.UserKey),
    credentials: z.object({
      serverUrl: z.string().trim().url("Valid Chef Server URL required").optional(),
      orgName: z.string().trim().min(1, "Organization name required"),
      userName: z.string().trim().min(1, "User name required"),
      privateKey: z.string().trim().min(1, "Private key required"),
      dataBagSecret: z
        .string()
        .trim()
        .optional()
        .transform((value) => value || undefined)
    })
  })
]);

const powerDnsRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.PowerDns)
});

export const powerDnsConnectionFormSchema = z.discriminatedUnion("method", [
  powerDnsRootSchema.extend({
    method: z.literal(PowerDnsConnectionMethod.ApiKey),
    credentials: z.object({
      apiUrl: z
        .string()
        .trim()
        .url("API URL must be a valid URL")
        .max(512, "API URL cannot exceed 512 characters")
        .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
          message: "API URL must use http or https"
        })
        .refine((value) => !new URL(value).search && !new URL(value).hash, {
          message: "API URL must not contain a query string or fragment"
        })
        .refine((value) => !/\/api(\/v\d+)?\/*$/.test(new URL(value).pathname), {
          message: "Enter the web server address only, without the /api/v1 path"
        }),
      apiKey: z
        .string()
        .trim()
        .min(1, "API key required")
        .max(512, "API key cannot exceed 512 characters"),
      serverId: z
        .string()
        .trim()
        .max(64, "Server ID cannot exceed 64 characters")
        .refine((value) => !value || /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value), {
          message: "Server ID may only contain letters, numbers, dots, hyphens and underscores"
        })
        .refine((value) => !value.includes(".."), { message: "Server ID cannot contain '..'" })
        .transform((value) => value || undefined)
        .optional(),
      sslRejectUnauthorized: z.boolean(),
      sslCertificate: z
        .string()
        .trim()
        .max(8192, "SSL certificate cannot exceed 8192 characters")
        .transform((value) => value || undefined)
        .optional()
    })
  })
]);

const databricksRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Databricks)
});

export const databricksConnectionFormSchema = z.discriminatedUnion("method", [
  databricksRootSchema.extend({
    method: z.literal(DatabricksConnectionMethod.ServicePrincipal),
    credentials: z.object({
      workspaceUrl: z.string().url().trim().min(1, "Workspace URL required"),
      clientId: z.string().trim().min(1, "Client ID required"),
      clientSecret: z.string().trim().min(1, "Client secret required"),
      scopes: z.nativeEnum(DatabricksConnectionScope).array().optional()
    })
  })
]);

const isValidJiraInstanceUrl = (value: string) => {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
};

const jiraInstanceUrlSchema = z
  .string()
  .trim()
  .min(1, "Instance URL required")
  .max(512, "Instance URL cannot exceed 512 characters")
  .refine(
    isValidJiraInstanceUrl,
    "Instance URL must be an http or https URL without credentials, a query, or a fragment"
  );

const jiraRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Jira)
});

export const jiraConnectionFormSchema = z.discriminatedUnion("method", [
  jiraRootSchema.extend({
    method: z.literal(JiraConnectionMethod.ApiToken),
    credentials: z.object({
      instanceUrl: jiraInstanceUrlSchema,
      email: z
        .string()
        .trim()
        .min(1, "Email required")
        .max(320, "Email cannot exceed 320 characters")
        .refine(isValidEmail, "Email must be a valid email address"),
      apiToken: z
        .string()
        .trim()
        .min(1, "API token required")
        .max(1024, "API token cannot exceed 1024 characters")
    })
  }),
  jiraRootSchema.extend({
    method: z.literal(JiraConnectionMethod.PersonalAccessToken),
    credentials: z.object({
      instanceUrl: jiraInstanceUrlSchema,
      personalAccessToken: z
        .string()
        .trim()
        .min(1, "Personal access token required")
        .max(1024, "Personal access token cannot exceed 1024 characters"),
      sslRejectUnauthorized: z.boolean().default(true),
      sslCertificate: z
        .string()
        .trim()
        .max(16384, "SSL certificate cannot exceed 16384 characters")
        .transform((value) => value || undefined)
        .optional()
    })
  })
]);

const serviceNowRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.ServiceNow)
});

export const serviceNowConnectionFormSchema = z.discriminatedUnion("method", [
  serviceNowRootSchema.extend({
    method: z.literal(ServiceNowConnectionMethod.BasicAuth),
    credentials: z.object({
      instanceUrl: z
        .string()
        .trim()
        .url("Invalid instance URL")
        .max(512, "Instance URL cannot exceed 512 characters")
        .refine((value) => value.startsWith("https://"), "Instance URL must use HTTPS")
        .refine((value) => {
          let url: URL;
          try {
            url = new URL(value);
          } catch {
            // zod runs refinements even after `.url()` fails, and `.url()` has already reported this value
            return true;
          }
          return (url.pathname === "" || url.pathname === "/") && !url.search && !url.hash;
        }, "Enter the base URL of your instance, without a path"),
      username: z
        .string()
        .trim()
        .min(1, "Username is required")
        .max(256, "Username cannot exceed 256 characters"),
      password: z
        .string()
        .trim()
        .min(1, "Password is required")
        .max(512, "Password cannot exceed 512 characters")
    })
  })
]);

const keeperRootSchema = genericAppConnectionFieldsSchema.extend({
  app: z.literal(AppConnection.Keeper)
});

export const keeperConnectionFormSchema = z.discriminatedUnion("method", [
  keeperRootSchema.extend({
    method: z.literal(KeeperConnectionMethod.ApiKey),
    credentials: z.object({
      instanceUrl: z
        .string()
        .trim()
        .url("Invalid Instance URL")
        .min(1, "Instance URL required")
        .max(255),
      apiKey: z.string().trim().min(1, "API Key required").max(500)
    })
  })
]);
