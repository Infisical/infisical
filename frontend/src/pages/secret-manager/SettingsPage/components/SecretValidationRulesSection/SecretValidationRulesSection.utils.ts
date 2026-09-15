import {
  DatabaseIcon,
  EqualNotIcon,
  HashIcon,
  KeyRoundIcon,
  LayersIcon,
  LucideIcon,
  RulerIcon,
  TerminalIcon,
  TextCursorInputIcon,
  TextIcon
} from "lucide-react";
import { z } from "zod";

import {
  DynamicSecretRuleProvider,
  MAX_PREVENT_DUPLICATE_SECRET_VALUE_VERSIONS,
  SecretRotationRuleProvider,
  SecretValidationRuleType,
  TConstraints,
  TValueConstraints
} from "@app/hooks/api/secretValidationRules";

export { DynamicSecretRuleProvider, SecretRotationRuleProvider };

// The editor works in a list of constraints; the API groups them by target. `RuleType` is the local
// alias the form and the cards were built against.
export const RuleType = SecretValidationRuleType;
export type RuleType = SecretValidationRuleType;

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
    label: "Prevent Value Reuse",
    description: "Reject values already in use",
    cardDescription: "Rejects an update when the new value matches a value already in use.",
    placeholder: 10,
    icon: EqualNotIcon,
    allowedTargets: [ConstraintTarget.SecretValue]
  }
];

export const CONSTRAINT_VALUE_LABELS: Record<ConstraintType, string> = {
  [ConstraintType.MinLength]: "Characters",
  [ConstraintType.MaxLength]: "Characters",
  [ConstraintType.RegexPattern]: "Pattern",
  [ConstraintType.RequiredPrefix]: "Text",
  [ConstraintType.RequiredSuffix]: "Text",
  [ConstraintType.PreventValueReuse]: "Versions to check"
};

export const CONSTRAINT_TYPE_LABELS: Record<ConstraintType, string> = {
  [ConstraintType.MinLength]: "Min Length",
  [ConstraintType.MaxLength]: "Max Length",
  [ConstraintType.RegexPattern]: "Regex Pattern",
  [ConstraintType.RequiredPrefix]: "Required Prefix",
  [ConstraintType.RequiredSuffix]: "Required Suffix",
  [ConstraintType.PreventValueReuse]: "Prevent Value Reuse"
};

export const RULE_TYPE_LABELS: Record<RuleType, string> = {
  [RuleType.StaticSecrets]: "Static Secrets",
  [RuleType.DynamicSecrets]: "Dynamic Secrets",
  [RuleType.SecretRotations]: "Secret Rotations"
};

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
  },
  {
    value: SecretRotationRuleProvider.MySqlCredentials,
    label: "MySQL Credentials",
    icon: DatabaseIcon
  },
  {
    value: SecretRotationRuleProvider.MsSqlCredentials,
    label: "MsSQL Credentials",
    icon: DatabaseIcon
  },
  {
    value: SecretRotationRuleProvider.OracleDBCredentials,
    label: "OracleDB Credentials",
    icon: DatabaseIcon
  },
  {
    value: SecretRotationRuleProvider.UnixLinuxLocalAccount,
    label: "Unix/Linux Local Account",
    icon: TerminalIcon
  },
  {
    value: SecretRotationRuleProvider.LdapPassword,
    label: "LDAP Password",
    icon: KeyRoundIcon
  }
];

// Reuse prevention is intentionally static-secret-only. For dynamic secrets each
// lease is independent so reuse has no meaning; for rotations we drive uniqueness
// through password generation (length/regex) rather than failing a rotation at
// issue time because the generator happened to land on a value already in use.
export const DYNAMIC_SECRET_RULE_DISALLOWED_CONSTRAINTS: ConstraintType[] = [
  ConstraintType.PreventValueReuse
];
export const SECRET_ROTATION_RULE_DISALLOWED_CONSTRAINTS: ConstraintType[] = [
  ConstraintType.PreventValueReuse
];

export const MAX_PREVENT_VALUE_REUSE_VERSIONS = MAX_PREVENT_DUPLICATE_SECRET_VALUE_VERSIONS;
export const DEFAULT_PREVENT_VALUE_REUSE_VERSIONS = 10;

export const constraintSchema = z
  .object({
    type: z.nativeEnum(ConstraintType),
    appliesTo: z.nativeEnum(ConstraintTarget),
    value: z.string(),
    // Reuse prevention holds two independently toggleable checks; every other
    // constraint is a single setting carried in `value`.
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

// Each constraint kind maps to one field on the API's constraint object. Reuse prevention is grouped
// under its own key, so it is handled on its own rather than by a field name.
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
          reusePrevention: {
            ...(checkPreviousVersions && { previousVersions: Number(value) }),
            ...(checkOtherSecretsInScope && { otherSecretsInScope: true })
          }
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
  const { reusePrevention, ...fields } = constraints ?? {};

  const flattened: TConstraint[] = Object.entries(fields)
    .filter(([, value]) => value !== undefined)
    .map(([field, value]) => ({ type: CONSTRAINT_TYPES[field], appliesTo, value: String(value) }));

  // `otherSecretsInScope` is absent on rules saved before the two checks were merged.
  if (reusePrevention?.previousVersions !== undefined || reusePrevention?.otherSecretsInScope) {
    flattened.push({
      type: ConstraintType.PreventValueReuse,
      appliesTo,
      value: String(reusePrevention.previousVersions ?? DEFAULT_PREVENT_VALUE_REUSE_VERSIONS),
      checkPreviousVersions: reusePrevention.previousVersions !== undefined,
      checkOtherSecretsInScope: Boolean(reusePrevention.otherSecretsInScope)
    });
  }

  return flattened;
};
