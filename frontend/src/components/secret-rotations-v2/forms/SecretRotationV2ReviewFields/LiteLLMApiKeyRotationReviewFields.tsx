import { useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
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
        <GenericFieldLabel label="Key Name">{name}</GenericFieldLabel>
        {userId && <GenericFieldLabel label="User">{userId}</GenericFieldLabel>}
        {teamId && <GenericFieldLabel label="Team">{teamId}</GenericFieldLabel>}
        {models && models.length > 0 && (
          <GenericFieldLabel label="Models">{models.join(", ")}</GenericFieldLabel>
        )}
        <GenericFieldLabel label="Additional Options" className="w-full">
          {additionalOptions ? (
            <span className="mt-1 block max-h-40 overflow-auto rounded-sm border border-mineshaft-600 bg-mineshaft-900 p-2 font-mono text-xs break-words whitespace-pre-wrap text-mineshaft-200">
              {additionalOptions}
            </span>
          ) : undefined}
        </GenericFieldLabel>
      </SecretRotationReviewSection>
      <SecretRotationReviewSection label="Secrets Mapping">
        <GenericFieldLabel label="API Key">{apiKey}</GenericFieldLabel>
      </SecretRotationReviewSection>
    </>
  );
};
