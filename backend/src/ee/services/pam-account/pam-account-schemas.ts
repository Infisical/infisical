/* eslint-disable no-underscore-dangle */
import dns from "dns";
import ConnectionString from "mongodb-connection-string-url";
import RE2 from "re2";
import { promisify } from "util";
import { z } from "zod";

import { BadRequestError } from "@app/lib/errors";

import { GcpServiceAccountAuthMethod, PamAccountType } from "../pam/pam-enums";
import { getApplicablePolicies, PamPolicyDescriptorSchema } from "../pam/pam-policies";
import {
  PamAccountSettingsOverridesSchema,
  PamTemplateSettingsSchema
} from "../pam-account-template/pam-account-template-schemas";
import { PamRecordingStorageBackend } from "../pam-session-recording/pam-recording-enums";

const resolveSrv = promisify(dns.resolveSrv);

enum PamFieldWidget {
  Text = "text",
  Number = "number",
  Boolean = "boolean",
  Select = "select",
  Textarea = "textarea",
  Password = "password"
}

const optionalTrimmedString = z
  .string()
  .trim()
  .transform((v) => v || undefined)
  .optional();

const normalizeDelimitedStringList = (value: unknown): unknown => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return value;
  const items = value
    .split("\n")
    .flatMap((line) => line.split(","))
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return items;
};

export const hostPattern = new RE2(/^[A-Za-z0-9.:_-]+$/);
const delimitedStringList = z.preprocess(
  normalizeDelimitedStringList,
  z.array(z.string().trim().min(1).max(255).regex(hostPattern, "Must be a valid hostname or IP address")).min(1)
);

// Source of truth for account types: per-type schemas + sparse UI hints
export const ACCOUNT_TYPE_CONFIGS = {
  [PamAccountType.Postgres]: {
    name: "PostgreSQL",
    icon: "Postgres.png",
    connectionDetails: z.object({
      host: z.string().trim().min(1).max(255),
      port: z.coerce.number(),
      database: z.string().trim().min(1).max(255),
      sslEnabled: z.boolean(),
      sslRejectUnauthorized: z.boolean(),
      sslCertificate: optionalTrimmedString
    }),
    credentials: z.object({
      username: z.string().trim().min(1).max(63),
      password: z
        .string()
        .trim()
        .max(256)
        .transform((v) => v || undefined)
        .optional()
    }),
    sanitizedCredentials: z.object({ username: z.string() }),
    ui: {
      port: { defaultValue: 5432 },
      sslEnabled: { label: "SSL Enabled" },
      sslRejectUnauthorized: {
        label: "Reject Unauthorized",
        showWhen: { field: "sslEnabled", equals: true }
      },
      sslCertificate: {
        label: "SSL Certificate",
        widget: PamFieldWidget.Textarea,
        showWhen: { field: "sslEnabled", equals: true }
      },
      password: { widget: PamFieldWidget.Password, secret: true }
    }
  },

  [PamAccountType.MySQL]: {
    name: "MySQL",
    icon: "MySql.png",
    connectionDetails: z.object({
      host: z.string().trim().min(1).max(255),
      port: z.coerce.number(),
      database: z.string().trim().min(1).max(64),
      sslEnabled: z.boolean(),
      sslRejectUnauthorized: z.boolean(),
      sslCertificate: optionalTrimmedString
    }),
    credentials: z.object({
      username: z.string().trim().min(1).max(32),
      password: z
        .string()
        .trim()
        .max(256)
        .transform((v) => v || undefined)
        .optional()
    }),
    sanitizedCredentials: z.object({ username: z.string() }),
    ui: {
      port: { defaultValue: 3306 },
      sslEnabled: { label: "SSL Enabled" },
      sslRejectUnauthorized: {
        label: "Reject Unauthorized",
        showWhen: { field: "sslEnabled", equals: true }
      },
      sslCertificate: {
        label: "SSL Certificate",
        widget: PamFieldWidget.Textarea,
        showWhen: { field: "sslEnabled", equals: true }
      },
      password: { widget: PamFieldWidget.Password, secret: true }
    }
  },

  [PamAccountType.MsSQL]: {
    name: "Microsoft SQL Server",
    icon: "MsSql.png",
    connectionDetails: z.object({
      host: z.string().trim().min(1).max(255),
      port: z.coerce.number(),
      database: z.string().trim().min(1).max(255),
      sslEnabled: z.boolean(),
      sslRejectUnauthorized: z.boolean(),
      sslCertificate: optionalTrimmedString
    }),
    credentials: z.discriminatedUnion("authMethod", [
      z.object({
        authMethod: z.literal("sql-login"),
        username: z.string().trim().min(1).max(63),
        password: z
          .string()
          .trim()
          .max(256)
          .transform((v) => v || undefined)
          .optional()
      }),
      z.object({
        authMethod: z.literal("ntlm"),
        username: z.string().trim().min(1).max(63),
        password: z
          .string()
          .trim()
          .max(256)
          .transform((v) => v || undefined)
          .optional(),
        domain: z.string().trim().min(1).max(255)
      }),
      z.object({
        authMethod: z.literal("kerberos"),
        username: z.string().trim().min(1).max(63),
        password: z
          .string()
          .trim()
          .max(256)
          .transform((v) => v || undefined)
          .optional(),
        realm: z
          .string()
          .trim()
          .min(1)
          .max(255)
          .regex(new RE2(/^[A-Za-z0-9._-]+$/))
          .transform((v) => v.toUpperCase()),
        kdcAddress: z
          .string()
          .trim()
          .max(255)
          .regex(new RE2(/^[A-Za-z0-9._:-]*$/))
          .transform((v) => v || undefined)
          .optional(),
        spn: z
          .string()
          .trim()
          .min(1)
          .max(500)
          .regex(new RE2(/^[A-Za-z0-9._:/-]+$/))
      })
    ]),
    sanitizedCredentials: z.object({
      authMethod: z.string().optional(),
      username: z.string().optional(),
      domain: z.string().optional(),
      realm: z.string().optional(),
      kdcAddress: z.string().optional(),
      spn: z.string().optional()
    }),
    ui: {
      port: { defaultValue: 1433 },
      database: { defaultValue: "master" },
      authMethod: {
        label: "Auth Method",
        defaultValue: "sql-login",
        options: [
          { label: "SQL Server Authentication", value: "sql-login" },
          { label: "Windows Authentication (NTLM)", value: "ntlm" },
          { label: "Windows Authentication (Kerberos)", value: "kerberos" }
        ]
      },
      domain: { label: "Domain" },
      realm: { label: "Realm" },
      kdcAddress: { label: "KDC Address" },
      spn: { label: "SPN" },
      sslEnabled: { label: "SSL Enabled" },
      sslRejectUnauthorized: {
        label: "Reject Unauthorized",
        showWhen: { field: "sslEnabled", equals: true }
      },
      sslCertificate: {
        label: "SSL Certificate",
        widget: PamFieldWidget.Textarea,
        showWhen: { field: "sslEnabled", equals: true }
      },
      password: { widget: PamFieldWidget.Password, secret: true }
    }
  },

  [PamAccountType.MongoDB]: {
    name: "MongoDB",
    icon: "MongoDB.png",
    connectionDetails: z.object({
      connectionString: z
        .string()
        .trim()
        .min(1)
        .max(1024)
        .transform((val, ctx) => {
          let cs: ConnectionString;
          try {
            cs = new ConnectionString(val);
          } catch {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Invalid MongoDB connection string. Must start with mongodb:// or mongodb+srv://"
            });
            return z.NEVER;
          }

          if (cs.username || cs.password) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message:
                "Credentials should not be included in the connection string. Use the Username and Password fields instead"
            });
            return z.NEVER;
          }

          if (cs.pathname && cs.pathname !== "/") {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Database should not be included in the connection string. Use the Database field instead"
            });
            return z.NEVER;
          }

          return cs.toString();
        }),
      database: z
        .string()
        .trim()
        .min(1)
        .max(64)
        .refine((val) => new RE2("^[a-zA-Z0-9_-]+$").test(val), {
          message: "Database name can only contain letters, numbers, underscores, and hyphens"
        }),
      sslEnabled: z.boolean(),
      sslRejectUnauthorized: z.boolean(),
      sslCertificate: optionalTrimmedString
    }),
    credentials: z.object({
      username: z.string().trim().min(1).max(255),
      password: z
        .string()
        .trim()
        .max(256)
        .transform((v) => v || undefined)
        .optional()
    }),
    sanitizedCredentials: z.object({ username: z.string().optional() }),
    ui: {
      connectionString: {
        label: "Connection String",
        widget: PamFieldWidget.Textarea,
        tooltip: "Supports mongodb:// and mongodb+srv:// URIs. Do not include credentials or database in the URI."
      },
      database: { defaultValue: "admin" },
      sslEnabled: { label: "SSL Enabled" },
      sslRejectUnauthorized: {
        label: "Reject Unauthorized",
        showWhen: { field: "sslEnabled", equals: true }
      },
      sslCertificate: {
        label: "SSL Certificate",
        widget: PamFieldWidget.Textarea,
        showWhen: { field: "sslEnabled", equals: true }
      },
      password: { widget: PamFieldWidget.Password, secret: true }
    }
  },

  [PamAccountType.SSH]: {
    name: "SSH",
    icon: "SSH.png",
    connectionDetails: z.object({
      host: z.string().trim().min(1).max(255),
      port: z.coerce.number()
    }),
    credentials: z.discriminatedUnion("authMethod", [
      z.object({
        authMethod: z.literal("password"),
        username: z.string().trim().min(1),
        password: optionalTrimmedString
      }),
      z.object({
        authMethod: z.literal("public-key"),
        username: z.string().trim().min(1),
        privateKey: z
          .string()
          .trim()
          .max(5000)
          .transform((v) => v || undefined)
          .optional()
      }),
      z.object({ authMethod: z.literal("certificate"), username: z.string().trim().min(1) })
    ]),
    sanitizedCredentials: z.object({
      authMethod: z.string(),
      username: z.string()
    }),
    ui: {
      port: { defaultValue: 22 },
      authMethod: { label: "Auth Method" },
      password: { widget: PamFieldWidget.Password, secret: true },
      privateKey: { label: "Private Key", widget: PamFieldWidget.Textarea, secret: true }
    },
    internalMetadata: z.object({
      caPrivateKey: z.string(),
      caPublicKey: z.string(),
      caKeyAlgorithm: z.string()
    })
  },

  [PamAccountType.Kubernetes]: {
    name: "Kubernetes",
    icon: "Kubernetes.png",
    connectionDetails: z.object({
      url: z.string().url().trim().max(500),
      sslRejectUnauthorized: z.boolean(),
      sslCertificate: optionalTrimmedString
    }),
    credentials: z.discriminatedUnion("authMethod", [
      z.object({
        authMethod: z.literal("service-account-token"),
        serviceAccountToken: z.string().trim().min(1).max(10000)
      }),
      z.object({
        authMethod: z.literal("gateway-kubernetes-auth"),
        namespace: z.string().trim().min(1).max(63),
        serviceAccountName: z.string().trim().min(1).max(253)
      })
    ]),
    sanitizedCredentials: z.object({
      authMethod: z.string().optional(),
      namespace: z.string().optional(),
      serviceAccountName: z.string().optional()
    }),
    ui: {
      url: { label: "Kubernetes API URL" },
      sslRejectUnauthorized: { label: "Reject Unauthorized" },
      sslCertificate: { label: "SSL Certificate", widget: PamFieldWidget.Textarea },
      authMethod: { label: "Auth Method" },
      serviceAccountToken: { label: "Service Account Token", widget: PamFieldWidget.Textarea, secret: true },
      namespace: { label: "Namespace" },
      serviceAccountName: { label: "Service Account Name" }
    }
  },

  [PamAccountType.GcpServiceAccount]: {
    name: "GCP Service Account",
    icon: "Google Cloud Platform.png",
    connectionDetails: z.object({
      serviceAccountEmail: z
        .string()
        .trim()
        .min(1)
        .max(255)
        .email("Must be a valid service account email address")
        .refine((val) => val.endsWith(".iam.gserviceaccount.com"), {
          message: "Must be a GCP service account email (ending in .iam.gserviceaccount.com)"
        })
    }),
    credentials: z.discriminatedUnion("authMethod", [
      z.object({
        authMethod: z.literal(GcpServiceAccountAuthMethod.Impersonation)
      }),
      z.object({
        authMethod: z.literal(GcpServiceAccountAuthMethod.StaticKey),
        serviceAccountKeyJson: z
          .string()
          .trim()
          .min(1)
          .max(8192)
          .refine(
            (val) => {
              try {
                const parsed = JSON.parse(val) as Record<string, unknown>;
                return typeof parsed.client_email === "string" && typeof parsed.private_key === "string";
              } catch {
                return false;
              }
            },
            { message: "Must be valid JSON containing client_email and private_key fields" }
          )
      })
    ]),
    sanitizedCredentials: z.object({
      authMethod: z.string()
    }),
    ui: {
      serviceAccountEmail: { label: "Service Account Email" },
      authMethod: {
        label: "Auth Method",
        tooltip:
          "Impersonation uses the platform's GCP identity to generate short-lived tokens for the target service account.\nStatic Key uses a service account key JSON stored directly in the PAM account.",
        defaultValue: GcpServiceAccountAuthMethod.Impersonation,
        options: [
          { label: "Impersonation (Recommended)", value: GcpServiceAccountAuthMethod.Impersonation },
          { label: "Static Key", value: GcpServiceAccountAuthMethod.StaticKey }
        ]
      },
      serviceAccountKeyJson: {
        label: "Service Account Key JSON",
        widget: PamFieldWidget.Textarea,
        secret: true
      }
    }
  },

  [PamAccountType.Windows]: {
    name: "Windows",
    icon: "Windows.png",
    connectionDetails: z.object({
      host: z.string().trim().min(1).max(255),
      port: z.coerce.number().int().min(1).max(65535)
    }),
    credentials: z.object({
      username: z.string().trim().min(1).max(255),
      password: optionalTrimmedString
    }),
    sanitizedCredentials: z.object({
      username: z.string()
    }),
    ui: {
      port: { defaultValue: 3389 },
      password: { widget: PamFieldWidget.Password, secret: true }
    }
  },

  [PamAccountType.WindowsAd]: {
    name: "Windows AD",
    icon: "ActiveDirectory.png",
    connectionDetails: z.object({
      domain: z.string().trim().min(1).max(255),
      dcAddress: z.string().trim().min(1).max(255),
      hosts: delimitedStringList,
      port: z.coerce.number().int().min(1).max(65535),
      rdpPort: z.coerce.number().int().min(1).max(65535),
      useLdaps: z.boolean(),
      ldapRejectUnauthorized: z.boolean(),
      ldapCaCert: optionalTrimmedString,
      ldapTlsServerName: optionalTrimmedString
    }),
    credentials: z.object({
      username: z.string().trim().min(1).max(255),
      password: optionalTrimmedString
    }),
    sanitizedCredentials: z.object({
      username: z.string()
    }),
    ui: {
      domain: {
        label: "FQDN",
        tooltip: "The fully qualified domain name of the Active Directory domain (e.g. corp.example.com)."
      },
      dcAddress: {
        label: "DC Address",
        tooltip:
          "Hostname or IP address of a domain controller, used for LDAP connections (e.g. dc01.corp.example.com)."
      },
      hosts: {
        label: "Allowed Hosts",
        widget: PamFieldWidget.Textarea,
        tooltip: "Hostnames or IP addresses this account is allowed to connect to. One per line or comma-separated."
      },
      port: { label: "LDAP Port", defaultValue: 389 },
      rdpPort: { label: "RDP Port", defaultValue: 3389 },
      useLdaps: { label: "Use LDAPS" },
      ldapRejectUnauthorized: { label: "Reject Unauthorized" },
      ldapCaCert: {
        label: "CA Certificate",
        widget: PamFieldWidget.Textarea,
        showWhen: { field: "useLdaps", equals: true }
      },
      ldapTlsServerName: {
        label: "TLS Server Name",
        showWhen: { field: "useLdaps", equals: true }
      },
      username: {
        tooltip: "Use the DOMAIN\\username format for domain authentication (e.g. CORP\\Administrator)."
      },
      password: { widget: PamFieldWidget.Password, secret: true }
    }
  },

  [PamAccountType.AwsIam]: {
    name: "AWS IAM",
    icon: "Amazon Web Services.png",
    requiresGateway: false,
    connectionDetails: z.object({
      roleArn: z.string().trim().min(1).max(2048)
    }),
    credentials: z.object({
      targetRoleArn: z.string().trim().min(1).max(2048)
    }),
    sanitizedCredentials: z.object({
      targetRoleArn: z.string().optional()
    }),
    ui: {
      roleArn: {
        label: "PAM Role ARN",
        tooltip: "The ARN of the IAM role that Infisical assumes to broker access to the target role."
      },
      targetRoleArn: {
        label: "Target Role ARN",
        tooltip: "The ARN of the IAM role the user will assume when accessing this account."
      }
    }
  }
} as const satisfies Partial<
  Record<
    PamAccountType,
    {
      name: string;
      icon: string;
      requiresGateway?: boolean;
      connectionDetails: z.ZodTypeAny;
      credentials: z.ZodTypeAny;
      sanitizedCredentials: z.ZodTypeAny;
      ui?: Record<
        string,
        {
          label?: string;
          widget?: PamFieldWidget;
          secret?: boolean;
          defaultValue?: string | number | boolean;
          showWhen?: { field: string; equals: string | boolean };
          tooltip?: string;
          options?: { label: string; value: string }[];
        }
      >;
      internalMetadata?: z.ZodTypeAny;
    }
  >
>;

type TSupportedAccountType = keyof typeof ACCOUNT_TYPE_CONFIGS;

const getAccountTypeConfig = (accountType: PamAccountType | string) => {
  const config = ACCOUNT_TYPE_CONFIGS[accountType as TSupportedAccountType];
  if (!config) {
    throw new Error(`Account type '${accountType}' is not supported in this phase`);
  }
  return config;
};

export const validateConnectionDetails = (accountType: PamAccountType, data: unknown) => {
  return getAccountTypeConfig(accountType).connectionDetails.parse(data) as z.output<
    (typeof ACCOUNT_TYPE_CONFIGS)[TSupportedAccountType]["connectionDetails"]
  >;
};

export const validateCredentials = (accountType: PamAccountType, data: unknown) => {
  return getAccountTypeConfig(accountType).credentials.parse(data) as z.output<
    (typeof ACCOUNT_TYPE_CONFIGS)[TSupportedAccountType]["credentials"]
  >;
};

export const sanitizeCredentials = (accountType: PamAccountType, data: unknown) => {
  return getAccountTypeConfig(accountType).sanitizedCredentials.parse(data) as z.output<
    (typeof ACCOUNT_TYPE_CONFIGS)[TSupportedAccountType]["sanitizedCredentials"]
  >;
};

export type TGatewayTarget = { host: string; port?: number };

export const extractGatewayTarget = async (
  accountType: PamAccountType,
  rawConnectionDetails: Record<string, unknown>
): Promise<TGatewayTarget> => {
  const validated = validateConnectionDetails(accountType, rawConnectionDetails);

  switch (accountType) {
    case PamAccountType.SSH:
    case PamAccountType.Postgres:
    case PamAccountType.MySQL:
    case PamAccountType.MsSQL:
    case PamAccountType.Windows:
      return {
        host: (validated as { host: string; port: number }).host,
        port: (validated as { host: string; port: number }).port
      };
    case PamAccountType.Kubernetes: {
      const { url } = validated as { url: string };
      const parsed = new URL(url);
      return { host: parsed.hostname };
    }
    case PamAccountType.MongoDB: {
      const { connectionString } = validated as { connectionString: string };
      const cs = new ConnectionString(connectionString);
      const [firstHost] = cs.hosts;

      if (cs.isSRV) {
        const records = await resolveSrv(`_mongodb._tcp.${firstHost}`);
        if (records.length === 0) {
          throw new BadRequestError({
            message: `Unable to resolve SRV record for MongoDB host "${firstHost}". Ensure the host is a valid SRV domain.`
          });
        }
        const record = records[Math.floor(Math.random() * records.length)];
        return { host: record.name, port: record.port };
      }

      const colonIdx = firstHost.lastIndexOf(":");
      if (colonIdx !== -1) {
        return {
          host: firstHost.slice(0, colonIdx),
          port: parseInt(firstHost.slice(colonIdx + 1), 10)
        };
      }
      return { host: firstHost, port: 27017 };
    }
    case PamAccountType.WindowsAd:
      return {
        host: (validated as { hosts: string[]; rdpPort: number }).hosts[0],
        port: (validated as { hosts: string[]; rdpPort: number }).rdpPort
      };
    case PamAccountType.GcpServiceAccount:
      return { host: "googleapis.com", port: 443 };
    case PamAccountType.AwsIam:
      throw new Error("AWS IAM accounts do not use gateway routing");
    default:
      throw new Error(`No gateway target extraction defined for account type '${accountType}'`);
  }
};

// Hosts the launcher can pick from, or null for single-host account types
export const getSelectableHosts = (
  accountType: PamAccountType,
  rawConnectionDetails: Record<string, unknown>
): string[] | null => {
  if (accountType !== PamAccountType.WindowsAd) return null;
  return (validateConnectionDetails(accountType, rawConnectionDetails) as { hosts: string[] }).hosts;
};

// Validates a requested host against the allow-list; falls back to the first
export const resolveSelectedHost = (
  accountType: PamAccountType,
  rawConnectionDetails: Record<string, unknown>,
  requestedHost?: string | null
): string | null => {
  const hosts = getSelectableHosts(accountType, rawConnectionDetails);
  if (!hosts) return null;
  if (requestedHost && !hosts.includes(requestedHost)) {
    throw new BadRequestError({ message: `Host '${requestedHost}' is not in this account's allowed hosts` });
  }
  return requestedHost || hosts[0];
};

// The account type the gateway sees. Windows AD is brokered through the Windows RDP protocol
export const resolveGatewayAccountType = (accountType: PamAccountType): PamAccountType =>
  accountType === PamAccountType.WindowsAd ? PamAccountType.Windows : accountType;

export const buildSessionGatewayConnectionDetails = (
  accountType: PamAccountType,
  rawConnectionDetails: Record<string, unknown>,
  selectedHost?: string | null
): Record<string, unknown> => {
  const validated = validateConnectionDetails(accountType, rawConnectionDetails) as Record<string, unknown>;

  if (accountType === PamAccountType.WindowsAd) {
    const { hosts, rdpPort } = validated as { hosts: string[]; rdpPort: number };

    return {
      host: selectedHost || hosts[0],
      port: rdpPort
    };
  }

  return validated;
};

// A username already carries its domain if it's NT4 (`DOMAIN\user`) or UPN (`user@domain`)
export const isDomainQualifiedUsername = (username: string) => username.includes("\\") || username.includes("@");

// Domain-qualifies a bare username to `NETBIOS\user` for RDP/NLA; already-qualified forms pass through
export const qualifyUsernameWithDomain = (username: string, domainFqdn: string) => {
  if (isDomainQualifiedUsername(username)) return username;
  return `${domainFqdn.split(".")[0].toUpperCase()}\\${username}`;
};

// Normalizes any form to a NetBIOS `DOMAIN\user` login
export const toNetbiosUsername = (username: string, domainFqdn: string) => {
  if (username.includes("\\")) return username;
  const localPart = username.includes("@") ? username.split("@")[0] : username;
  return `${domainFqdn.split(".")[0].toUpperCase()}\\${localPart}`;
};

// -- Account accessibility

export enum PamAccountAccessibilityIssue {
  NoGateway = "no-gateway",
  NoRecordingConfig = "no-recording-config",
  NoCredential = "no-credential"
}

export const accountTypeRequiresRecording = (accountType: PamAccountType): boolean =>
  accountType === PamAccountType.Windows || accountType === PamAccountType.WindowsAd;

export const accountTypeRequiresGateway = (accountType: PamAccountType): boolean => {
  const config = ACCOUNT_TYPE_CONFIGS[accountType as TSupportedAccountType] as
    | { requiresGateway?: boolean }
    | undefined;
  return config?.requiresGateway !== false;
};

export const getAccountAccessibilityIssues = (account: {
  accountType: PamAccountType | string;
  gatewayId?: string | null;
  gatewayPoolId?: string | null;
  templateGatewayId?: string | null;
  templateGatewayPoolId?: string | null;
  recordingConnectionId?: string | null;
  templateRecordingConnectionId: string | null;
  settingsOverrides?: unknown;
  templateSettings: unknown;
  credentialConfigured: boolean;
}): PamAccountAccessibilityIssue[] => {
  const issues: PamAccountAccessibilityIssue[] = [];

  if (
    accountTypeRequiresGateway(account.accountType as PamAccountType) &&
    !account.gatewayId &&
    !account.gatewayPoolId &&
    !account.templateGatewayId &&
    !account.templateGatewayPoolId
  ) {
    issues.push(PamAccountAccessibilityIssue.NoGateway);
  }

  if (accountTypeRequiresRecording(account.accountType as PamAccountType)) {
    const settingsParsed = PamTemplateSettingsSchema.safeParse(account.templateSettings);
    const parsedTemplateSettings = settingsParsed.success ? settingsParsed.data : null;
    const overridesParsed = PamAccountSettingsOverridesSchema.safeParse(account.settingsOverrides ?? {});
    const parsedOverrides = overridesParsed.success ? overridesParsed.data : null;

    const hasRecordingConfig = Boolean(
      parsedTemplateSettings?.recordingStorageBackend === PamRecordingStorageBackend.AwsS3 &&
        (account.recordingConnectionId || account.templateRecordingConnectionId) &&
        (parsedOverrides?.recordingS3Config || parsedTemplateSettings?.recordingS3Config)
    );
    if (!hasRecordingConfig) issues.push(PamAccountAccessibilityIssue.NoRecordingConfig);
  }

  if (!account.credentialConfigured) issues.push(PamAccountAccessibilityIssue.NoCredential);
  return issues;
};

export type TSshInternalMetadata = z.infer<(typeof ACCOUNT_TYPE_CONFIGS)[PamAccountType.SSH]["internalMetadata"]>;

export const parseInternalMetadata = (accountType: PamAccountType, data: unknown): TSshInternalMetadata | null => {
  if (accountType === PamAccountType.SSH) {
    const result = ACCOUNT_TYPE_CONFIGS[PamAccountType.SSH].internalMetadata.safeParse(data);
    return result.success ? result.data : null;
  }
  return null;
};

// -- Frontend field metadata derived from the schemas above

export const PamFieldDescriptorSchema = z.object({
  key: z.string(),
  label: z.string(),
  widget: z.nativeEnum(PamFieldWidget),
  required: z.boolean(),
  secret: z.boolean(),
  options: z.array(z.object({ label: z.string(), value: z.string() })).optional(),

  // Value the form prefills the field with on create
  defaultValue: z.union([z.string(), z.number(), z.boolean()]).optional(),

  // Only render when the referenced field equals this value
  showWhen: z.object({ field: z.string(), equals: z.union([z.string(), z.boolean()]) }).optional(),

  // Info tooltip shown next to the label
  tooltip: z.string().optional()
});

type PamFieldDescriptor = z.infer<typeof PamFieldDescriptorSchema>;

export const PamAccountTypeMetadataSchema = z.object({
  type: z.nativeEnum(PamAccountType),
  name: z.string(),
  icon: z.string(),
  supportsWebAccess: z.boolean(),
  requiresGateway: z.boolean(),
  connectionFields: z.array(PamFieldDescriptorSchema),
  credentialFields: z.array(PamFieldDescriptorSchema),
  applicablePolicies: z.array(PamPolicyDescriptorSchema)
});

type PamAccountTypeMetadata = z.infer<typeof PamAccountTypeMetadataSchema>;

type TFieldUiHint = {
  label?: string;
  widget?: PamFieldWidget;
  secret?: boolean;
  defaultValue?: string | number | boolean;
  showWhen?: PamFieldDescriptor["showWhen"];
  tooltip?: string;
  options?: { label: string; value: string }[];
};

const humanizeKey = (key: string) => {
  const spaced = key
    .replace(new RE2(/([A-Z])/g), " $1")
    .replace(new RE2(/-/g), " ")
    .trim();
  return spaced
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
};

const unwrapField = (schema: z.ZodTypeAny): { base: z.ZodTypeAny; required: boolean } => {
  let current = schema;
  let required = true;
  for (let depth = 0; depth < 20; depth += 1) {
    const { typeName } = current._def as { typeName?: string };
    if (typeName === "ZodOptional" || typeName === "ZodDefault") {
      required = false;
      current = (current._def as { innerType: z.ZodTypeAny }).innerType;
    } else if (typeName === "ZodNullable") {
      current = (current._def as { innerType: z.ZodTypeAny }).innerType;
    } else if (typeName === "ZodEffects") {
      current = (current._def as { schema: z.ZodTypeAny }).schema;
    } else {
      break;
    }
  }
  return { base: current, required };
};

const widgetForBase = (base: z.ZodTypeAny): PamFieldWidget => {
  const { typeName } = base._def as { typeName?: string };
  if (typeName === "ZodNumber") return PamFieldWidget.Number;
  if (typeName === "ZodBoolean") return PamFieldWidget.Boolean;
  if (typeName === "ZodEnum") return PamFieldWidget.Select;
  return PamFieldWidget.Text;
};

const describeField = (
  key: string,
  schema: z.ZodTypeAny,
  ui: Record<string, TFieldUiHint>,
  showWhen?: PamFieldDescriptor["showWhen"]
): PamFieldDescriptor => {
  const { base, required } = unwrapField(schema);
  const hint = ui[key] ?? {};
  const widget = hint.widget ?? widgetForBase(base);
  const enumValues = (base._def as { values?: string[] }).values;
  const resolvedShowWhen = hint.showWhen ?? showWhen;

  return {
    key,
    label: hint.label ?? humanizeKey(key),
    widget,
    required,
    secret: hint.secret ?? widget === PamFieldWidget.Password,
    ...(widget === PamFieldWidget.Select
      ? { options: hint.options ?? (enumValues ? enumValues.map((v) => ({ label: humanizeKey(v), value: v })) : []) }
      : {}),
    ...(hint.defaultValue !== undefined ? { defaultValue: hint.defaultValue } : {}),
    ...(resolvedShowWhen ? { showWhen: resolvedShowWhen } : {}),
    ...(hint.tooltip ? { tooltip: hint.tooltip } : {})
  };
};

const fieldsFromSchema = (schema: z.ZodTypeAny, ui: Record<string, TFieldUiHint> = {}): PamFieldDescriptor[] => {
  const { typeName } = schema._def as { typeName?: string };

  if (typeName === "ZodObject") {
    const { shape } = schema as z.ZodObject<z.ZodRawShape>;
    return Object.entries(shape).map(([key, fieldSchema]) => describeField(key, fieldSchema, ui));
  }

  // Discriminated union (e.g. SSH authMethod)
  if (typeName === "ZodDiscriminatedUnion") {
    const def = schema._def as {
      discriminator: string;
      options: z.ZodObject<z.ZodRawShape>[];
    };
    const variants = [...def.options];
    const { discriminator } = def;

    const occurrences = new Map<string, number>();
    variants.forEach((variant) => {
      Object.keys(variant.shape).forEach((key) => {
        if (key !== discriminator) occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
      });
    });

    const discriminatorValues = variants.map(
      (variant) => (variant.shape[discriminator]._def as { value: string }).value
    );
    const discHint = ui[discriminator] ?? {};
    const fields: PamFieldDescriptor[] = [
      {
        key: discriminator,
        label: discHint.label ?? humanizeKey(discriminator),
        widget: PamFieldWidget.Select,
        required: true,
        secret: false,
        options: discHint.options ?? discriminatorValues.map((v) => ({ label: humanizeKey(v), value: v })),
        ...(discHint.defaultValue !== undefined ? { defaultValue: discHint.defaultValue } : {}),
        ...(discHint.tooltip ? { tooltip: discHint.tooltip } : {})
      }
    ];

    const added = new Set<string>([discriminator]);
    variants.forEach((variant) => {
      const variantValue = (variant.shape[discriminator]._def as { value: string }).value;
      Object.entries(variant.shape).forEach(([key, fieldSchema]) => {
        if (key === discriminator) return;
        const isShared = occurrences.get(key) === variants.length;
        if (isShared) {
          if (added.has(key)) return;
          added.add(key);
          fields.push(describeField(key, fieldSchema, ui));
        } else {
          fields.push(describeField(key, fieldSchema, ui, { field: discriminator, equals: variantValue }));
        }
      });
    });
    return fields;
  }

  return [];
};

export const buildPamAccountTypeMetadata = (webAccessSupportedTypes: Set<PamAccountType>): PamAccountTypeMetadata[] =>
  (
    Object.entries(ACCOUNT_TYPE_CONFIGS) as [
      TSupportedAccountType,
      (typeof ACCOUNT_TYPE_CONFIGS)[TSupportedAccountType]
    ][]
  ).map(([type, config]) => ({
    type,
    name: config.name,
    icon: config.icon,
    supportsWebAccess: webAccessSupportedTypes.has(type),
    requiresGateway: accountTypeRequiresGateway(type),
    connectionFields: fieldsFromSchema(config.connectionDetails, config.ui),
    credentialFields: fieldsFromSchema(config.credentials, config.ui),
    applicablePolicies: getApplicablePolicies(type)
  }));

export const isCredentialConfigured = (accountType: PamAccountType, credentials: Record<string, unknown>): boolean => {
  const config = ACCOUNT_TYPE_CONFIGS[accountType as TSupportedAccountType];
  if (!config) return false;

  const applicableSecretFields = fieldsFromSchema(config.credentials, config.ui).filter(
    (field) => field.secret && (!field.showWhen || credentials[field.showWhen.field] === field.showWhen.equals)
  );
  if (applicableSecretFields.length === 0) return true;

  return applicableSecretFields.some((field) => {
    const value = credentials[field.key];
    return typeof value === "string" && value.trim().length > 0;
  });
};
