import { TSecretValidationRules } from "@app/db/schemas";

import {
  TDynamicSecretsRuleConfig,
  TDynamicSecretsValidationRule,
  TDynamicSecretsValidationRuleInput,
  TDynamicSecretsValidationRuleUpdate
} from "./dynamic-secrets";
import {
  TSecretRotationsRuleConfig,
  TSecretRotationsValidationRule,
  TSecretRotationsValidationRuleInput,
  TSecretRotationsValidationRuleUpdate
} from "./secret-rotations";
import {
  DynamicSecretRuleProvider,
  SecretRotationRuleProvider,
  SecretValidationRuleType
} from "./secret-validation-rule-enums";
import { TConstraints, TValueConstraints } from "./secret-validation-rule-schemas";
import {
  TStaticSecretsRuleConfig,
  TStaticSecretsValidationRule,
  TStaticSecretsValidationRuleInput,
  TStaticSecretsValidationRuleUpdate
} from "./static-secrets";

export type TSecretValidationRule =
  | TStaticSecretsValidationRule
  | TDynamicSecretsValidationRule
  | TSecretRotationsValidationRule;

export type TSecretValidationRuleInput =
  | TStaticSecretsValidationRuleInput
  | TDynamicSecretsValidationRuleInput
  | TSecretRotationsValidationRuleInput;

export type TSecretValidationRuleUpdate =
  | TStaticSecretsValidationRuleUpdate
  | TDynamicSecretsValidationRuleUpdate
  | TSecretRotationsValidationRuleUpdate;

export type TSecretValidationRuleConfig =
  | TStaticSecretsRuleConfig
  | TDynamicSecretsRuleConfig
  | TSecretRotationsRuleConfig;

export type TGeneratedCredentialProvider = DynamicSecretRuleProvider | SecretRotationRuleProvider;

type TRuleScopeCreateFields = {
  name: string;
  projectId: string;
  description?: string | null;
  environment?: string;
  secretPath: string;
  isActive?: boolean;
};

type TRuleScopeUpdateFields = {
  name?: string;
  description?: string | null;
  environment?: string | null;
  secretPath?: string;
  isActive?: boolean;
};

/**
 * Every config field any rule type accepts, all optional. The service is type-agnostic, so it takes
 * the widest shape and hands it to that type's config schema, which narrows it and rejects the rest.
 */
type TAnyRuleConfigFields = {
  keyConstraints?: TValueConstraints;
  valueConstraints?: TValueConstraints;
  providers?: TGeneratedCredentialProvider[];
  passwordConstraints?: TConstraints;
};

/** The same fields on update, where null clears an optional constraint target. */
type TAnyRuleConfigPatch = {
  [K in keyof TAnyRuleConfigFields]: TAnyRuleConfigFields[K] | null;
};

export type TSecretValidationRuleWithEnv = TSecretValidationRules & {
  type: SecretValidationRuleType;
  envId: string | null;
  environment: {
    id: string;
    name: string;
    slug: string;
  } | null;
};

export type TListSecretValidationRulesDTO = {
  projectId: string;
  type?: SecretValidationRuleType;
};

export type TFindSecretValidationRuleByIdDTO = {
  ruleId: string;
  type: SecretValidationRuleType;
};

export type TCreateSecretValidationRuleDTO = TRuleScopeCreateFields &
  TAnyRuleConfigFields & {
    type: SecretValidationRuleType;
  };

export type TUpdateSecretValidationRuleDTO = TRuleScopeUpdateFields &
  TAnyRuleConfigPatch & {
    ruleId: string;
    type: SecretValidationRuleType;
  };

export type TDeleteSecretValidationRuleDTO = {
  ruleId: string;
  type: SecretValidationRuleType;
};

/** A secret about to be written, as the static-secret rules see it. */
export type TSecretToValidate = {
  key: string;
  value?: string;
  secretId?: string;
};

export type TValidateSecretsDTO = {
  projectId: string;
  environment: string;
  envId: string;
  secretPath: string;
  secrets: TSecretToValidate[];
};

export type TFindConstraintsForGeneratedSecretDTO = {
  projectId: string;
  envId: string;
  secretPath: string;
  type: SecretValidationRuleType.DynamicSecrets | SecretValidationRuleType.SecretRotations;
  provider: TGeneratedCredentialProvider;
};

/** The constraints a generated credential has to satisfy, and the rules that asked for them. */
export type TGeneratedPasswordValidation = {
  constraints: TConstraints;
  ruleNames: string[];
};

export type { TConstraints, TValueConstraints };
