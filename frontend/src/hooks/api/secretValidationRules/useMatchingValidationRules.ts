import { useMemo } from "react";
import picomatch from "picomatch";

import { useProject } from "@app/context";

import { useListSecretValidationRules } from "./queries";
import {
  DynamicSecretRuleProvider,
  SecretRotationRuleProvider,
  SecretValidationRuleType,
  TDynamicSecretsInputs,
  TSecretRotationsInputs
} from "./types";

type TParams = {
  type: SecretValidationRuleType.DynamicSecrets | SecretValidationRuleType.SecretRotations;
  provider: DynamicSecretRuleProvider | SecretRotationRuleProvider;
  environmentSlug?: string | null;
  secretPath?: string;
};

/**
 * Returns the active validation rules that cover the given
 * generated-credential scope (env + path + provider + rule type).
 * Used by dynamic-secret and rotation forms to surface a warning that
 * user-configured password requirements will be ignored.
 */
export const useMatchingValidationRules = ({
  type,
  provider,
  environmentSlug,
  secretPath
}: TParams) => {
  const { currentProject } = useProject();
  const { data: rules = [] } = useListSecretValidationRules({ projectId: currentProject.id });

  const matchingRules = useMemo(() => {
    if (!environmentSlug || !secretPath) return [];

    const env = currentProject.environments.find((e) => e.slug === environmentSlug);
    const envId = env?.id;

    return rules.filter((rule) => {
      if (!rule.isActive) return false;
      if (rule.type !== type) return false;
      if (rule.envId && rule.envId !== envId) return false;
      if (!picomatch.isMatch(secretPath, rule.secretPath, { strictSlashes: false })) return false;
      // `rule.type !== type` compares against a variable, so TS can't narrow the
      // union here — only generated-credential arms reach this point.
      const generatedRule = rule as TDynamicSecretsInputs | TSecretRotationsInputs;
      return generatedRule.providers?.includes(provider as never);
    });
  }, [rules, type, provider, environmentSlug, secretPath, currentProject.environments]);

  return matchingRules;
};
