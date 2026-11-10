import { z } from "zod";

import {
  DynamicSecretRuleProvider,
  MAX_PREVENT_DUPLICATE_SECRET_VALUE_VERSIONS,
  SecretRotationRuleProvider,
  SecretValidationRuleType as RuleType,
  type TConstraints,
  type TValueConstraints
} from "@app/hooks/api/secretValidationRules/types";

export { DynamicSecretRuleProvider, RuleType, SecretRotationRuleProvider };

export enum ConstraintType {
  MinLength = "min-length",
  MaxLength = "max-length",
  RegexPattern = "regex-pattern",
  RequiredPrefix = "required-prefix",
  RequiredSuffix = "required-suffix",
  PreventValueReuse = "prevent-value-reuse"
}

export enum ConstraintTarget {
  SecretKey = "key",
  SecretValue = "value",
  GeneratedPassword = "password"
}

export const TARGET_LABELS: Record<ConstraintTarget, string> = {
  [ConstraintTarget.SecretKey]: "Secret key",
  [ConstraintTarget.SecretValue]: "Secret value",
  [ConstraintTarget.GeneratedPassword]: "Generated password"
};

export const CONSTRAINT_OPTIONS: {
  type: ConstraintType;
  label: string;
  description: string;
  cardDescription?: string;
  placeholder: string;
  valueLabel: string;
  allowedTargets?: ConstraintTarget[];
}[] = [
  {
    type: ConstraintType.MinLength,
    label: "Min length",
    description: "Minimum character count",
    placeholder: "8",
    valueLabel: "Characters"
  },
  {
    type: ConstraintType.MaxLength,
    label: "Max length",
    description: "Maximum character count",
    placeholder: "256",
    valueLabel: "Characters"
  },
  {
    type: ConstraintType.RegexPattern,
    label: "Regex pattern",
    description: "Must match a regular expression",
    placeholder: "^[A-Z_]+$",
    valueLabel: "Pattern"
  },
  {
    type: ConstraintType.RequiredPrefix,
    label: "Required prefix",
    description: "Must start with specific text",
    placeholder: "PREFIX-",
    valueLabel: "Text"
  },
  {
    type: ConstraintType.RequiredSuffix,
    label: "Required suffix",
    description: "Must end with specific text",
    placeholder: "-SUFFIX",
    valueLabel: "Text"
  },
  {
    type: ConstraintType.PreventValueReuse,
    label: "Prevent value reuse",
    description: "Reject values already in use",
    cardDescription: "Rejects an update when the new value matches a value already in use.",
    placeholder: "10",
    valueLabel: "Versions to check",
    allowedTargets: [ConstraintTarget.SecretValue]
  }
];

export const RULE_TYPE_LABELS: Record<RuleType, string> = {
  [RuleType.StaticSecrets]: "Static secrets",
  [RuleType.DynamicSecrets]: "Dynamic secrets",
  [RuleType.SecretRotations]: "Secret rotations"
};

export const DYNAMIC_SECRET_PROVIDER_OPTIONS = [
  { value: DynamicSecretRuleProvider.SqlDatabase, label: "SQL database" },
  { value: DynamicSecretRuleProvider.Milvus, label: "Milvus" }
];

export const SECRET_ROTATION_PROVIDER_OPTIONS = [
  { value: SecretRotationRuleProvider.PostgresCredentials, label: "PostgreSQL credentials" },
  { value: SecretRotationRuleProvider.MySqlCredentials, label: "MySQL credentials" },
  { value: SecretRotationRuleProvider.MsSqlCredentials, label: "MsSQL credentials" },
  { value: SecretRotationRuleProvider.OracleDBCredentials, label: "OracleDB credentials" },
  { value: SecretRotationRuleProvider.UnixLinuxLocalAccount, label: "Unix/Linux local account" },
  { value: SecretRotationRuleProvider.LdapPassword, label: "LDAP password" }
];

// Reuse prevention is static-secret-only: each dynamic lease is independent, and rotations get
// uniqueness from password generation rather than failing at issue time on a collision.
export const GENERATED_RULE_DISALLOWED_CONSTRAINTS: ConstraintType[] = [
  ConstraintType.PreventValueReuse
];

export const MAX_PREVENT_VALUE_REUSE_VERSIONS = MAX_PREVENT_DUPLICATE_SECRET_VALUE_VERSIONS;
export const DEFAULT_PREVENT_VALUE_REUSE_VERSIONS = 10;
export const ORACLE_12C_MAX_PASSWORD_LENGTH = 30;

export const constraintSchema = z
  .object({
    type: z.nativeEnum(ConstraintType),
    appliesTo: z.nativeEnum(ConstraintTarget),
    value: z.string(),
    checkPreviousVersions: z.boolean().optional(),
    checkOtherSecretsInScope: z.boolean().optional()
  })
  .refine((c) => c.type === ConstraintType.PreventValueReuse || c.value.length > 0, {
    message: "Value is required",
    path: ["value"]
  })
  .superRefine((c, ctx) => {
    if (c.type === ConstraintType.PreventValueReuse) {
      if (!c.checkPreviousVersions && !c.checkOtherSecretsInScope) {
        ctx.addIssue({
          path: ["checkPreviousVersions"],
          code: z.ZodIssueCode.custom,
          message: "Turn on at least one check"
        });
        return;
      }
      if (!c.checkPreviousVersions) return;
      const num = Number(c.value);
      if (!c.value.length || !Number.isInteger(num)) {
        ctx.addIssue({
          path: ["value"],
          code: z.ZodIssueCode.custom,
          message: "Number of previous versions is required"
        });
      } else if (num < 1 || num > MAX_PREVENT_VALUE_REUSE_VERSIONS) {
        ctx.addIssue({
          path: ["value"],
          code: z.ZodIssueCode.custom,
          message: `Must be a number between 1 and ${MAX_PREVENT_VALUE_REUSE_VERSIONS}`
        });
      }
    } else if (c.type === ConstraintType.MinLength && Number(c.value) <= 0) {
      ctx.addIssue({
        path: ["value"],
        code: z.ZodIssueCode.custom,
        message: "Minimum length must be at least 1"
      });
    } else if (c.type === ConstraintType.MaxLength && Number(c.value) <= 0) {
      ctx.addIssue({
        path: ["value"],
        code: z.ZodIssueCode.custom,
        message: "Maximum length must be at least 1"
      });
    }
  });

const constraintsSchema = z
  .array(constraintSchema)
  .min(1, "At least one constraint is required")
  .refine(
    (constraints) => {
      const pairs = constraints.map((c) => `${c.type}:${c.appliesTo}`);
      return new Set(pairs).size === pairs.length;
    },
    { message: "Duplicate constraint for the same target" }
  );

export const ruleFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
  environment: z.string().nullable().default(null),
  folderPath: z.string().min(1, "Folder path is required").default("/**"),
  enforcement: z.discriminatedUnion("type", [
    z.object({ type: z.literal(RuleType.StaticSecrets), constraints: constraintsSchema }),
    z.object({
      type: z.literal(RuleType.DynamicSecrets),
      providers: z
        .array(z.nativeEnum(DynamicSecretRuleProvider))
        .min(1, "Select at least one provider"),
      constraints: constraintsSchema
    }),
    z.object({
      type: z.literal(RuleType.SecretRotations),
      providers: z
        .array(z.nativeEnum(SecretRotationRuleProvider))
        .min(1, "Select at least one provider"),
      constraints: constraintsSchema
    })
  ])
});

export type TRuleForm = z.infer<typeof ruleFormSchema>;
export type TConstraint = z.infer<typeof constraintSchema>;

const CONSTRAINT_FIELDS: Record<string, keyof TConstraints> = {
  [ConstraintType.MinLength]: "minLength",
  [ConstraintType.MaxLength]: "maxLength",
  [ConstraintType.RegexPattern]: "regexPattern",
  [ConstraintType.RequiredPrefix]: "requiredPrefix",
  [ConstraintType.RequiredSuffix]: "requiredSuffix"
};

const CONSTRAINT_TYPES = Object.fromEntries(
  Object.entries(CONSTRAINT_FIELDS).map(([type, field]) => [field, type as ConstraintType])
) as Record<string, ConstraintType>;

const NUMERIC_CONSTRAINTS: ConstraintType[] = [ConstraintType.MinLength, ConstraintType.MaxLength];

export const groupConstraintsByTarget = (constraints: TConstraint[]) => {
  const grouped: Partial<Record<ConstraintTarget, TValueConstraints>> = {};
  constraints.forEach(
    ({ type, appliesTo, value, checkPreviousVersions, checkOtherSecretsInScope }) => {
      const current = grouped[appliesTo] ?? {};
      if (type === ConstraintType.PreventValueReuse) {
        grouped[appliesTo] = {
          ...current,
          ...(checkPreviousVersions && { uniqueAcrossLastVersions: Number(value) }),
          ...(checkOtherSecretsInScope && { uniqueWithinScope: true })
        };
      } else {
        grouped[appliesTo] = {
          ...current,
          [CONSTRAINT_FIELDS[type]]: NUMERIC_CONSTRAINTS.includes(type) ? Number(value) : value
        };
      }
    }
  );
  return grouped;
};

export const flattenConstraints = (
  constraints: TValueConstraints | null | undefined,
  appliesTo: ConstraintTarget
): TConstraint[] => {
  const { uniqueAcrossLastVersions, uniqueWithinScope, ...fields } = constraints ?? {};
  const flattened: TConstraint[] = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([field, value]) => ({ type: CONSTRAINT_TYPES[field], appliesTo, value: String(value) }));
  // uniqueWithinScope is absent on rules saved before the two reuse checks were merged.
  if (uniqueAcrossLastVersions !== undefined || uniqueWithinScope) {
    flattened.push({
      type: ConstraintType.PreventValueReuse,
      appliesTo,
      value: String(uniqueAcrossLastVersions ?? DEFAULT_PREVENT_VALUE_REUSE_VERSIONS),
      checkPreviousVersions: uniqueAcrossLastVersions !== undefined,
      checkOtherSecretsInScope: Boolean(uniqueWithinScope)
    });
  }
  return flattened;
};
