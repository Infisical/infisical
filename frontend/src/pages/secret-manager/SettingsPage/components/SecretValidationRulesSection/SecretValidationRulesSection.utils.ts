import {
  CopyXIcon,
  DatabaseIcon,
  HashIcon,
  HistoryIcon,
  LayersIcon,
  LucideIcon,
  RulerIcon,
  TextCursorInputIcon,
  TextIcon
} from "lucide-react";
import { z } from "zod";

export enum ConstraintType {
  MinLength = "min-length",
  MaxLength = "max-length",
  RegexPattern = "regex-pattern",
  RequiredPrefix = "required-prefix",
  RequiredSuffix = "required-suffix",
  PreventValueReuse = "prevent-value-reuse",
  PreventDuplicatedValues = "prevent-duplicated-values"
}

export enum ConstraintTarget {
  SecretKey = "key",
  SecretValue = "value",
  GeneratedPassword = "password"
}

export const CONSTRAINT_OPTIONS: {
  type: ConstraintType;
  label: string;
  description: string;
  cardDescription?: string;
  placeholder: string | number;
  icon: LucideIcon;
  allowedTargets?: ConstraintTarget[];
}[] = [
  {
    type: ConstraintType.MinLength,
    label: "Min Length",
    description: "Minimum character count",
    placeholder: 8,
    icon: RulerIcon
  },
  {
    type: ConstraintType.MaxLength,
    label: "Max Length",
    description: "Maximum character count",
    placeholder: 256,
    icon: RulerIcon
  },
  {
    type: ConstraintType.RegexPattern,
    label: "Regex Pattern",
    description: "Must match a regular expression",
    placeholder: "^[A-Z_]+$",
    icon: HashIcon
  },
  {
    type: ConstraintType.RequiredPrefix,
    label: "Required Prefix",
    description: "Must start with specific text",
    placeholder: "PREFIX-",
    icon: TextCursorInputIcon
  },
  {
    type: ConstraintType.RequiredSuffix,
    label: "Required Suffix",
    description: "Must end with specific text",
    placeholder: "-SUFFIX",
    icon: TextIcon
  },
  {
    type: ConstraintType.PreventValueReuse,
    label: "Prevent Value Repetition",
    description: "Prevent reusing previous secret values",
    cardDescription:
      "When a secret is updated, its new value is checked against the specified number of prior versions to prevent reuse of previous values.",
    placeholder: 10,
    icon: HistoryIcon,
    allowedTargets: [ConstraintTarget.SecretValue]
  },
  {
    type: ConstraintType.PreventDuplicatedValues,
    label: "Prevent Duplicate Values",
    description: "Prevent multiple secrets from sharing the same value",
    cardDescription:
      "When a secret is created or updated, its value is checked against all other secrets in the selected scope to prevent duplicates.",
    placeholder: "",
    icon: CopyXIcon,
    allowedTargets: [ConstraintTarget.SecretValue]
  }
];

export const CONSTRAINT_VALUE_LABELS: Record<ConstraintType, string> = {
  [ConstraintType.MinLength]: "Characters",
  [ConstraintType.MaxLength]: "Characters",
  [ConstraintType.RegexPattern]: "Pattern",
  [ConstraintType.RequiredPrefix]: "Text",
  [ConstraintType.RequiredSuffix]: "Text",
  [ConstraintType.PreventValueReuse]: "Previous versions",
  [ConstraintType.PreventDuplicatedValues]: ""
};

export const CONSTRAINT_TYPE_LABELS: Record<ConstraintType, string> = {
  [ConstraintType.MinLength]: "Min Length",
  [ConstraintType.MaxLength]: "Max Length",
  [ConstraintType.RegexPattern]: "Regex Pattern",
  [ConstraintType.RequiredPrefix]: "Required Prefix",
  [ConstraintType.RequiredSuffix]: "Required Suffix",
  [ConstraintType.PreventValueReuse]: "Prevent Value Repetition",
  [ConstraintType.PreventDuplicatedValues]: "Prevent Duplicate Values"
};

export enum RuleType {
  StaticSecrets = "static-secrets",
  DynamicSecrets = "dynamic-secrets",
  SecretRotations = "secret-rotations"
}

export const RULE_TYPE_LABELS: Record<RuleType, string> = {
  [RuleType.StaticSecrets]: "Static Secrets",
  [RuleType.DynamicSecrets]: "Dynamic Secrets",
  [RuleType.SecretRotations]: "Secret Rotations"
};

// Provider identifiers selectable in dynamic-secret rules. Keep aligned with
// backend `DynamicSecretRuleProvider`.
export enum DynamicSecretRuleProvider {
  SqlDatabase = "sql-database",
  Milvus = "milvus"
}

// Provider identifiers selectable in secret-rotation rules. Keep aligned with
// backend `SecretRotationRuleProvider`.
export enum SecretRotationRuleProvider {
  PostgresCredentials = "postgres-credentials"
}

export type TProviderOption<T extends string> = {
  value: T;
  label: string;
  icon: LucideIcon;
};

export const DYNAMIC_SECRET_PROVIDER_OPTIONS: TProviderOption<DynamicSecretRuleProvider>[] = [
  { value: DynamicSecretRuleProvider.SqlDatabase, label: "SQL Database", icon: DatabaseIcon },
  { value: DynamicSecretRuleProvider.Milvus, label: "Milvus", icon: LayersIcon }
];

export const SECRET_ROTATION_PROVIDER_OPTIONS: TProviderOption<SecretRotationRuleProvider>[] = [
  {
    value: SecretRotationRuleProvider.PostgresCredentials,
    label: "PostgreSQL Credentials",
    icon: DatabaseIcon
  }
];

// PreventValueReuse is intentionally static-secret-only. For dynamic secrets
// each lease is independent so reuse has no meaning; for rotations we drive
// uniqueness through password generation (length/regex) rather than failing a
// rotation at issue time because the generator happened to land on a prior
// value.
export const DYNAMIC_SECRET_RULE_DISALLOWED_CONSTRAINTS: ConstraintType[] = [
  ConstraintType.PreventValueReuse,
  ConstraintType.PreventDuplicatedValues
];
export const SECRET_ROTATION_RULE_DISALLOWED_CONSTRAINTS: ConstraintType[] = [
  ConstraintType.PreventValueReuse,
  ConstraintType.PreventDuplicatedValues
];

export const MAX_PREVENT_VALUE_REUSE_VERSIONS = 25;

export const constraintSchema = z
  .object({
    type: z.nativeEnum(ConstraintType),
    appliesTo: z.nativeEnum(ConstraintTarget),
    value: z.string()
  })
  .refine(
    (c) =>
      c.type === ConstraintType.PreventValueReuse ||
      c.type === ConstraintType.PreventDuplicatedValues ||
      c.value.length > 0,
    {
      message: "Value is required",
      path: ["value"]
    }
  )
  .superRefine((c, ctx) => {
    if (c.type === ConstraintType.PreventValueReuse) {
      const num = Number(c.value);

      const isAboveMaxVersions =
        Number.isInteger(num) && (num < 1 || num > MAX_PREVENT_VALUE_REUSE_VERSIONS);

      if (isAboveMaxVersions) {
        ctx.addIssue({
          path: ["value"],
          code: z.ZodIssueCode.custom,
          message: `Must be a number between 1 and ${MAX_PREVENT_VALUE_REUSE_VERSIONS}`
        });
      }
    } else if (c.type === ConstraintType.MinLength) {
      const num = Number(c.value);

      if (num <= 0) {
        ctx.addIssue({
          path: ["value"],
          code: z.ZodIssueCode.custom,
          message: "Minimum length must be a at least 1"
        });
      }
    } else if (c.type === ConstraintType.MaxLength) {
      const num = Number(c.value);

      if (num <= 0) {
        ctx.addIssue({
          path: ["value"],
          code: z.ZodIssueCode.custom,
          message: "Maximum length must be a at least 1"
        });
      }
    }
  });

const duplicateConstraintRefinement = (
  constraints: { type: ConstraintType; appliesTo: ConstraintTarget }[]
) => {
  const pairs = constraints.map((c) => `${c.type}:${c.appliesTo}`);
  return new Set(pairs).size === pairs.length;
};

const staticSecretsInputsSchema = z.object({
  constraints: z
    .array(constraintSchema)
    .min(1, "At least one constraint is required")
    .refine(duplicateConstraintRefinement, { message: "Duplicate constraint for the same target" })
});

const dynamicSecretsInputsSchema = z.object({
  providers: z
    .array(z.nativeEnum(DynamicSecretRuleProvider))
    .min(1, "Select at least one provider"),
  constraints: z
    .array(constraintSchema)
    .min(1, "At least one constraint is required")
    .refine(duplicateConstraintRefinement, { message: "Duplicate constraint for the same target" })
});

const secretRotationsInputsSchema = z.object({
  providers: z
    .array(z.nativeEnum(SecretRotationRuleProvider))
    .min(1, "Select at least one provider"),
  constraints: z
    .array(constraintSchema)
    .min(1, "At least one constraint is required")
    .refine(duplicateConstraintRefinement, { message: "Duplicate constraint for the same target" })
});

export const ruleFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
  environment: z.string().nullable().default(null),
  folderPath: z.string().min(1, "Folder path is required").default("/**"),
  // Mirrors the API rule config shape (see backend `SecretValidationRuleSchema`).
  enforcement: z.discriminatedUnion("type", [
    z.object({ type: z.literal(RuleType.StaticSecrets), ...staticSecretsInputsSchema.shape }),
    z.object({ type: z.literal(RuleType.DynamicSecrets), ...dynamicSecretsInputsSchema.shape }),
    z.object({ type: z.literal(RuleType.SecretRotations), ...secretRotationsInputsSchema.shape })
  ])
});

export type TRuleForm = z.infer<typeof ruleFormSchema>;
export type TConstraint = z.infer<typeof constraintSchema>;

export type TRule = TRuleForm & {
  id: string;
  isActive: boolean;
};
