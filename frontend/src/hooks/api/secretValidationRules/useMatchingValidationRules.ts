import { useMemo } from "react";

import { useProject } from "@app/context";

import { useListSecretValidationRules } from "./queries";
import { doesRuleCoverScope } from "./scope";
import {
  DynamicSecretRuleProvider,
  SecretRotationRuleProvider,
  SecretValidationRuleType
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

    return rules.filter((rule) => {
      if (!rule.isActive) return false;
      if (rule.type !== type) return false;
      if (!doesRuleCoverScope(rule, { secretPath, environmentSlugs: [environmentSlug] }))
        return false;
      return "providers" in rule && rule.providers.includes(provider as never);
    });
  }, [rules, type, provider, environmentSlug, secretPath]);

  return matchingRules;
};
