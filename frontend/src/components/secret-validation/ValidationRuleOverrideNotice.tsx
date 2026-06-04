import { InfoIcon } from "lucide-react";

import {
  DynamicSecretRuleProvider,
  SecretRotationRuleProvider,
  SecretValidationRuleType,
  useMatchingValidationRules
} from "@app/hooks/api/secretValidationRules";

type Props = {
  type: SecretValidationRuleType.DynamicSecrets | SecretValidationRuleType.SecretRotations;
  provider: DynamicSecretRuleProvider | SecretRotationRuleProvider;
  environmentSlug?: string | null;
  secretPath?: string;
};

/**
 * Renders a low-key info banner when at least one active secret-validation
 * rule covers the given generated-credential scope. Surfaces that the
 * user-configured password requirements will be ignored in favor of the
 * rule's constraints.
 */
export const ValidationRuleOverrideNotice = ({
  type,
  provider,
  environmentSlug,
  secretPath
}: Props) => {
  const matching = useMatchingValidationRules({ type, provider, environmentSlug, secretPath });
  if (!matching.length) return null;

  const ruleLabel =
    matching.length === 1 ? `rule "${matching[0].name}"` : `${matching.length} rules`;
  return (
    <div className="mb-3 flex items-start gap-2 rounded-md border border-mineshaft-600 bg-mineshaft-800 px-3 py-2 text-xs text-mineshaft-200">
      <InfoIcon className="mt-0.5 size-4 shrink-0 text-mineshaft-400" />
      <span>
        A secret validation {ruleLabel} applies to this scope. The password configuration below will
        be ignored in favor of the rule&apos;s constraints.
      </span>
    </div>
  );
};
