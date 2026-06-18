/* eslint-disable no-underscore-dangle */
import { z } from "zod";

import { PamAccountType } from "../pam/pam-enums";

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
      sslEnabled: { label: "SSL Enabled" },
      sslRejectUnauthorized: { label: "Reject Unauthorized" },
      sslCertificate: { label: "SSL Certificate", widget: PamFieldWidget.Textarea },
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
      authMethod: { label: "Auth Method" },
      password: { widget: PamFieldWidget.Password, secret: true },
      privateKey: { label: "Private Key", widget: PamFieldWidget.Textarea, secret: true }
    },
    internalMetadata: z.object({
      caPrivateKey: z.string(),
      caPublicKey: z.string(),
      caKeyAlgorithm: z.string()
    })
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
      ui?: Record<string, { label?: string; widget?: PamFieldWidget; secret?: boolean }>;
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

export const extractGatewayTarget = (
  accountType: PamAccountType,
  rawConnectionDetails: Record<string, unknown>
): TGatewayTarget => {
  const validated = validateConnectionDetails(accountType, rawConnectionDetails);

  switch (accountType) {
    case PamAccountType.SSH:
    case PamAccountType.Postgres:
      return {
        host: (validated as { host: string; port: number }).host,
        port: (validated as { host: string; port: number }).port
      };
    default:
      throw new Error(`No gateway target extraction defined for account type '${accountType}'`);
  }
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

  // Only render when the discriminator field equals this value
  showWhen: z.object({ field: z.string(), equals: z.string() }).optional()
});

type PamFieldDescriptor = z.infer<typeof PamFieldDescriptorSchema>;

export const PamAccountTypeMetadataSchema = z.object({
  type: z.nativeEnum(PamAccountType),
  name: z.string(),
  icon: z.string(),
  connectionFields: z.array(PamFieldDescriptorSchema),
  credentialFields: z.array(PamFieldDescriptorSchema)
});

type PamAccountTypeMetadata = z.infer<typeof PamAccountTypeMetadataSchema>;

type TFieldUiHint = { label?: string; widget?: PamFieldWidget; secret?: boolean };

const humanizeKey = (key: string) =>
  key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();

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

  return {
    key,
    label: hint.label ?? humanizeKey(key),
    widget,
    required,
    secret: hint.secret ?? widget === PamFieldWidget.Password,
    ...(widget === PamFieldWidget.Select && enumValues
      ? { options: enumValues.map((v) => ({ label: humanizeKey(v), value: v })) }
      : {}),
    ...(showWhen ? { showWhen } : {})
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
        options: discriminatorValues.map((v) => ({ label: humanizeKey(v), value: v }))
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

export const buildPamAccountTypeMetadata = (): PamAccountTypeMetadata[] =>
  (
    Object.entries(ACCOUNT_TYPE_CONFIGS) as [
      TSupportedAccountType,
      (typeof ACCOUNT_TYPE_CONFIGS)[TSupportedAccountType]
    ][]
  ).map(([type, config]) => ({
    type,
    name: config.name,
    icon: config.icon,
    connectionFields: fieldsFromSchema(config.connectionDetails, config.ui),
    credentialFields: fieldsFromSchema(config.credentials, config.ui)
  }));
