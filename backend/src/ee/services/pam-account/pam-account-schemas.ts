/* eslint-disable no-underscore-dangle */
import dns from "dns";
import { promisify } from "util";

import ConnectionString from "mongodb-connection-string-url";
import RE2 from "re2";
import { z } from "zod";

import { BadRequestError } from "@app/lib/errors";

import { PamAccountType } from "../pam/pam-enums";
import { getApplicablePolicies, PamPolicyDescriptorSchema } from "../pam/pam-policies";

const resolveSrv = promisify(dns.resolveSrv);

enum PamFieldWidget {
  Text = "text",
  Number = "number",
  Boolean = "boolean",
  Select = "select",
  Textarea = "textarea",
  Password = "password"
}

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
      sslCertificate: z
        .string()
        .trim()
        .transform((v) => v || undefined)
        .optional()
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
    sanitizedCredentials: z.object({ username: z.string().optional() }),
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
      sslCertificate: z
        .string()
        .trim()
        .transform((v) => v || undefined)
        .optional()
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
    sanitizedCredentials: z.object({ username: z.string().optional() }),
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
      sslCertificate: z
        .string()
        .trim()
        .transform((v) => v || undefined)
        .optional()
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
      sslCertificate: z
        .string()
        .trim()
        .transform((v) => v || undefined)
        .optional()
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
        password: z
          .string()
          .trim()
          .transform((v) => v || undefined)
          .optional()
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
      authMethod: z.string().optional(),
      username: z.string().optional()
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
      sslCertificate: z
        .string()
        .trim()
        .transform((v) => v || undefined)
        .optional()
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
  }
} as const satisfies Partial<
  Record<
    PamAccountType,
    {
      name: string;
      icon: string;
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

const getAccountTypeConfig = (accountType: PamAccountType) => {
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
    default:
      throw new Error(`No gateway target extraction defined for account type '${accountType}'`);
  }
};

// -- Account accessibility

export enum PamAccountAccessibilityIssue {
  NoGateway = "no-gateway",
  NoRecordingConfig = "no-recording-config",
  NoCredential = "no-credential"
}

export const accountTypeRequiresRecording = (accountType: PamAccountType): boolean =>
  accountType === PamAccountType.Windows;

export const getAccountAccessibilityIssues = ({
  accountType,
  hasGateway,
  hasRecordingConfig,
  credentialConfigured
}: {
  accountType: PamAccountType;
  hasGateway: boolean;
  hasRecordingConfig: boolean;
  credentialConfigured: boolean;
}): PamAccountAccessibilityIssue[] => {
  const issues: PamAccountAccessibilityIssue[] = [];
  if (!hasGateway) issues.push(PamAccountAccessibilityIssue.NoGateway);
  if (accountTypeRequiresRecording(accountType) && !hasRecordingConfig) {
    issues.push(PamAccountAccessibilityIssue.NoRecordingConfig);
  }
  if (!credentialConfigured) issues.push(PamAccountAccessibilityIssue.NoCredential);
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
    ...(widget === PamFieldWidget.Select && enumValues
      ? { options: enumValues.map((v) => ({ label: humanizeKey(v), value: v })) }
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
    const fields: PamFieldDescriptor[] = [
      {
        key: discriminator,
        label: ui[discriminator]?.label ?? humanizeKey(discriminator),
        widget: PamFieldWidget.Select,
        required: true,
        secret: false,
        options: ui[discriminator]?.options ?? discriminatorValues.map((v) => ({ label: humanizeKey(v), value: v }))
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
