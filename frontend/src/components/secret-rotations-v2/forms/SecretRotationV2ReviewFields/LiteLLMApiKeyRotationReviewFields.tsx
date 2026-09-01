import { useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { ReviewField } from "@app/components/secret-rotations-v2/forms/shared";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

import { SecretRotationReviewSection } from "./shared";

export const LiteLLMApiKeyRotationReviewFields = () => {
  const { watch } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.LiteLLMApiKey;
    }
  >();

  const [{ name, userId, teamId, models, additionalOptions }, { apiKey }] = watch([
    "parameters",
    "secretsMapping"
  ]);

  return (
    <>
      <SecretRotationReviewSection label="Parameters">
        <ReviewField label="Key Name">{name}</ReviewField>
        {userId && <ReviewField label="User">{userId}</ReviewField>}
        {teamId && <ReviewField label="Team">{teamId}</ReviewField>}
        {models && models.length > 0 && (
          <ReviewField label="Models">{models.join(", ")}</ReviewField>
        )}
        <ReviewField label="Additional Options" className="w-full">
          {additionalOptions ? (
            <span className="mt-1 block max-h-40 overflow-auto rounded-sm border border-border bg-container p-2 font-mono text-xs break-words whitespace-pre-wrap text-foreground">
              {additionalOptions}
            </span>
          ) : undefined}
        </ReviewField>
      </SecretRotationReviewSection>
      <SecretRotationReviewSection label="Secrets Mapping">
        <ReviewField label="API Key">{apiKey}</ReviewField>
      </SecretRotationReviewSection>
    </>
  );
};
