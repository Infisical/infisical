import { TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@app/components/v3";
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
 * Renders a warning alert when at least one active secret-validation rule
 * covers the given generated-credential scope. Surfaces that the
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
    <Alert variant="warning" className="mb-3">
      <TriangleAlertIcon />
      <AlertTitle>Password configuration overridden by validation rule</AlertTitle>
      <AlertDescription>
        A secret validation {ruleLabel} applies to this scope. The password configuration below will
        be ignored. Generated passwords are produced from the rule&apos;s constraints instead.
      </AlertDescription>
    </Alert>
  );
};
