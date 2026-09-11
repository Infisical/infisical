import picomatch from "picomatch";

import { DynamicSecretProviders } from "@app/ee/services/dynamic-secret/providers/models";
import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";
import { BadRequestError, InternalServerError } from "@app/lib/errors";

import { DynamicSecretsRuleConfigSchema, TDynamicSecretsRuleConfig } from "./dynamic-secrets";
import { SecretRotationsRuleConfigSchema, TSecretRotationsRuleConfig } from "./secret-rotations";
import { listSetConstraintFields } from "./secret-validation-rule-constraint-fns";
import {
  ConstraintTarget,
  DynamicSecretRuleProvider,
  SecretRotationRuleProvider,
  SecretValidationRuleType
} from "./secret-validation-rule-enums";
import { SECRET_VALIDATION_RULE_NAME_MAP } from "./secret-validation-rule-maps";
import { TValueConstraints } from "./secret-validation-rule-schemas";
import { TGeneratedCredentialProvider, TSecretValidationRuleConfig } from "./secret-validation-rule-types";
import {
  evaluateStaticSecretConstraints,
  StaticSecretsRuleConfigSchema,
  TSecretToValidate,
  TStaticSecretsRuleConfig
} from "./static-secrets";

const CONFIG_SCHEMA_MAP = {
  [SecretValidationRuleType.StaticSecrets]: StaticSecretsRuleConfigSchema,
  [SecretValidationRuleType.DynamicSecrets]: DynamicSecretsRuleConfigSchema,
  [SecretValidationRuleType.SecretRotations]: SecretRotationsRuleConfigSchema
};

export const parseSecretValidationRuleConfig = (type: string, config: unknown): TSecretValidationRuleConfig => {
  const schema = CONFIG_SCHEMA_MAP[type as SecretValidationRuleType];
  if (!schema) {
    throw new InternalServerError({ message: `Unsupported secret validation rule type '${type}'` });
  }
  return schema.parse(config);
};

/** A rule's constraints keyed by what they apply to, so any two rules can be compared field by field. */
export const getConstraintsByTarget = (
  type: SecretValidationRuleType,
  config: TSecretValidationRuleConfig
): Record<string, TValueConstraints | undefined> => {
  if (type === SecretValidationRuleType.StaticSecrets) {
    const { keyConstraints, valueConstraints } = config as TStaticSecretsRuleConfig;
    return { [ConstraintTarget.SecretKey]: keyConstraints, [ConstraintTarget.SecretValue]: valueConstraints };
  }

  const { passwordConstraints } = config as TDynamicSecretsRuleConfig | TSecretRotationsRuleConfig;
  return { [ConstraintTarget.GeneratedPassword]: passwordConstraints };
};

/** The providers a generated-credential rule covers, or null for static-secret rules. */
export const getRuleProviders = (
  type: SecretValidationRuleType,
  config: TSecretValidationRuleConfig
): TGeneratedCredentialProvider[] | null => {
  if (type === SecretValidationRuleType.StaticSecrets) return null;
  return (config as TDynamicSecretsRuleConfig | TSecretRotationsRuleConfig).providers;
};

const doPathsOverlap = (pathA: string, pathB: string): boolean => {
  const opts: picomatch.PicomatchOptions = { strictSlashes: false };

  if (picomatch.isMatch(pathA, pathB, opts) || picomatch.isMatch(pathB, pathA, opts)) return true;

  // When both sides are globs, check whether the non-glob prefix of one is reachable from the other
  // pattern, e.g. "/a/**" vs "/a/b/*" — the prefix "/a/b" is matched by "/a/**".
  const scanA = picomatch.scan(pathA);
  const scanB = picomatch.scan(pathB);
  if (!scanA.isGlob || !scanB.isGlob) return false;

  return picomatch.isMatch(scanA.base || "/", pathB, opts) || picomatch.isMatch(scanB.base || "/", pathA, opts);
};

// A rule with no environment covers every environment, so it overlaps with all of them.
const doEnvironmentsOverlap = (envIdA?: string | null, envIdB?: string | null) =>
  !envIdA || !envIdB || envIdA === envIdB;

export type TExistingRule = {
  id: string;
  name: string;
  envId?: string | null;
  secretPath: string;
  type: string;
  config: TSecretValidationRuleConfig;
};

/**
 * Two rules of the same type conflict when they cover the same secrets and constrain the same thing.
 * Each would impose its own bound, so the second is rejected rather than both silently enforced.
 */
export const checkForOverlappingRules = ({
  type,
  envId,
  secretPath,
  config,
  existingRules,
  excludeRuleId
}: {
  type: SecretValidationRuleType;
  envId: string | null;
  secretPath: string;
  config: TSecretValidationRuleConfig;
  existingRules: TExistingRule[];
  excludeRuleId?: string;
}): void => {
  const incomingFields = listSetConstraintFields(getConstraintsByTarget(type, config));
  const incomingProviders = getRuleProviders(type, config);

  for (const existing of existingRules) {
    const sharesScope =
      existing.id !== excludeRuleId &&
      existing.type === type &&
      doEnvironmentsOverlap(envId, existing.envId) &&
      doPathsOverlap(secretPath, existing.secretPath);

    if (sharesScope) {
      const existingProviders = getRuleProviders(type, existing.config);
      const sharesProvider =
        !incomingProviders || !existingProviders || existingProviders.some((p) => incomingProviders.includes(p));

      if (sharesProvider) {
        const existingFields = listSetConstraintFields(getConstraintsByTarget(type, existing.config));
        const conflicts = [...incomingFields].filter((field) => existingFields.has(field));

        if (conflicts.length) {
          throw new BadRequestError({
            message: `Rule "${existing.name}" already constrains ${conflicts.join(", ")} over the same secrets. Change the environment, the secret path, or the constraints so the two rules do not overlap.`
          });
        }
      }
    }
  }
};

/** Only static-secret rules reach this path; generated credentials are shaped at generation. */
export type TRuleToEnforce = {
  name: string;
  config: TStaticSecretsRuleConfig;
};

/** Whether a rule scoped to `rulePath` reaches a secret sitting at `secretPath`. */
export const doesRulePathCover = (rulePath: string, secretPath: string) =>
  picomatch.isMatch(secretPath, rulePath, { strictSlashes: false });

export const findRulesCoveringScope = <T extends { envId?: string | null; secretPath: string }>(
  rules: T[],
  { envId, secretPath }: { envId: string; secretPath: string }
) => rules.filter((rule) => (!rule.envId || rule.envId === envId) && doesRulePathCover(rule.secretPath, secretPath));

export const enforceSecretValidationRules = ({
  rules,
  secrets
}: {
  rules: TRuleToEnforce[];
  secrets: (TSecretToValidate & { previousValues?: string[] })[];
}): void => {
  const failures: string[] = [];

  for (const rule of rules) {
    for (const secret of secrets) {
      for (const violation of evaluateStaticSecretConstraints(rule.config, secret)) {
        failures.push(
          `Secret "${secret.key}": ${violation.message} (rule: "${rule.name}", constraint: ${violation.label})`
        );
      }
    }
  }

  if (failures.length) {
    throw new BadRequestError({ message: `Secret validation failed:\n${failures.join("\n\n")}` });
  }
};

// Runtime provider types that validation rules can constrain. Anything unmapped returns null, which
// short-circuits the rule lookup for that provider.
export const convertDynamicSecretProviderToValidationRuleProvider = (
  type: DynamicSecretProviders
): DynamicSecretRuleProvider | null => {
  const map: Partial<Record<DynamicSecretProviders, DynamicSecretRuleProvider>> = {
    [DynamicSecretProviders.SqlDatabase]: DynamicSecretRuleProvider.SqlDatabase,
    [DynamicSecretProviders.Milvus]: DynamicSecretRuleProvider.Milvus
  };
  return map[type] ?? null;
};

export const convertSecretRotationToValidationRuleProvider = (
  type: SecretRotation
): SecretRotationRuleProvider | null => {
  const map: Partial<Record<SecretRotation, SecretRotationRuleProvider>> = {
    [SecretRotation.PostgresCredentials]: SecretRotationRuleProvider.PostgresCredentials,
    [SecretRotation.MySqlCredentials]: SecretRotationRuleProvider.MySqlCredentials,
    [SecretRotation.MsSqlCredentials]: SecretRotationRuleProvider.MsSqlCredentials,
    [SecretRotation.OracleDBCredentials]: SecretRotationRuleProvider.OracleDBCredentials,
    [SecretRotation.UnixLinuxLocalAccount]: SecretRotationRuleProvider.UnixLinuxLocalAccount,
    [SecretRotation.LdapPassword]: SecretRotationRuleProvider.LdapPassword
  };
  return map[type] ?? null;
};

export const secretValidationRuleName = (type: SecretValidationRuleType) => SECRET_VALIDATION_RULE_NAME_MAP[type];
