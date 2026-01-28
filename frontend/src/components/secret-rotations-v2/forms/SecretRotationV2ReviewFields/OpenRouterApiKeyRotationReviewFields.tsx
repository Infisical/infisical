import { useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

import { SecretRotationReviewSection } from "./shared";

const LIMIT_RESET_LABELS: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly"
};

export const OpenRouterApiKeyRotationReviewFields = () => {
  const { watch } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.OpenRouterApiKey;
    }
  >();

  const [parameters, { apiKey }] = watch(["parameters", "secretsMapping"]);

  return (
    <>
      <SecretRotationReviewSection label="Parameters">
        <GenericFieldLabel label="Key Name">{parameters.name}</GenericFieldLabel>
        {parameters.limit != null && (
          <GenericFieldLabel label="Credit Limit">${parameters.limit} USD</GenericFieldLabel>
        )}
        {parameters.limitReset && (
          <GenericFieldLabel label="Reset Limit">
            {LIMIT_RESET_LABELS[parameters.limitReset] || parameters.limitReset}
          </GenericFieldLabel>
        )}
      </SecretRotationReviewSection>
      <SecretRotationReviewSection label="Secrets Mapping">
        <GenericFieldLabel label="API Key">{apiKey}</GenericFieldLabel>
      </SecretRotationReviewSection>
    </>
  );
};
