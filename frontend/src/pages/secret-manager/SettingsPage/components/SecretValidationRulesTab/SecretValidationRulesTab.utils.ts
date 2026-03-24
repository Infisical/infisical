import { HashIcon, LucideIcon, RulerIcon, TextCursorInputIcon, TextIcon } from "lucide-react";
import { z } from "zod";

export enum ConstraintType {
  MinLength = "min-length",
  MaxLength = "max-length",
  RegexPattern = "regex-pattern",
  RequiredPrefix = "required-prefix",
  RequiredSuffix = "required-suffix"
}

export enum ConstraintTarget {
  SecretKey = "key",
  SecretValue = "value"
}

export const CONSTRAINT_OPTIONS: {
  type: ConstraintType;
  label: string;
  description: string;
  placeholder: string | number;
  icon: LucideIcon;
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
  }
];

export const CONSTRAINT_VALUE_LABELS: Record<ConstraintType, string> = {
  [ConstraintType.MinLength]: "Characters",
  [ConstraintType.MaxLength]: "Characters",
  [ConstraintType.RegexPattern]: "Pattern",
  [ConstraintType.RequiredPrefix]: "Text",
  [ConstraintType.RequiredSuffix]: "Text"
};

export const CONSTRAINT_TYPE_LABELS: Record<ConstraintType, string> = {
  [ConstraintType.MinLength]: "Min Length",
  [ConstraintType.MaxLength]: "Max Length",
  [ConstraintType.RegexPattern]: "Regex Pattern",
  [ConstraintType.RequiredPrefix]: "Required Prefix",
  [ConstraintType.RequiredSuffix]: "Required Suffix"
};

export enum RuleType {
  StaticSecrets = "static-secrets"
}

export const RULE_TYPE_LABELS: Record<RuleType, string> = {
  [RuleType.StaticSecrets]: "Static Secrets"
};

export const constraintSchema = z.object({
  type: z.nativeEnum(ConstraintType),
  appliesTo: z.nativeEnum(ConstraintTarget),
  value: z.string().min(1, "Value is required")
});

const staticSecretsInputsSchema = z.object({
  constraints: z
    .array(constraintSchema)
    .min(1, "At least one constraint is required")
    .refine(
      (constraints) => {
        const pairs = constraints.map((c) => `${c.type}:${c.appliesTo}`);
        return new Set(pairs).size === pairs.length;
      },
      { message: "Duplicate constraint for the same target" }
    )
});

export const ruleFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  description: z.string().max(500).optional(),
  environment: z.string().nullable().default(null),
  folderPath: z.string().default("/**"),
  enforcement: z.object({
    type: z.nativeEnum(RuleType),
    inputs: staticSecretsInputsSchema
  })
});

export type TRuleForm = z.infer<typeof ruleFormSchema>;
export type TConstraint = z.infer<typeof constraintSchema>;

export type TRule = TRuleForm & {
  id: string;
  isActive: boolean;
};
