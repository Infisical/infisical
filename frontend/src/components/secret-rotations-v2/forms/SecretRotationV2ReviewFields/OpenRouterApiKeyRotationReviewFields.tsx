import { useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { ReviewField } from "@app/components/secret-rotations-v2/forms/shared";
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
        <ReviewField label="Key Name">{parameters.name}</ReviewField>
        {parameters.limit != null && (
          <ReviewField label="Credit Limit">${parameters.limit} USD</ReviewField>
        )}
        {parameters.limitReset && (
          <ReviewField label="Reset Limit">
            {LIMIT_RESET_LABELS[parameters.limitReset] || parameters.limitReset}
          </ReviewField>
        )}
        {parameters.includeByokInLimit != null && (
          <ReviewField label="Include BYOK in limit">
            {parameters.includeByokInLimit ? "Yes" : "No"}
          </ReviewField>
        )}
      </SecretRotationReviewSection>
      <SecretRotationReviewSection label="Secrets Mapping">
        <ReviewField label="API Key">{apiKey}</ReviewField>
      </SecretRotationReviewSection>
    </>
  );
};
