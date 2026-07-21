import { useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

import { SecretRotationReviewSection } from "./shared";

export const DatadogApiKeyRotationReviewFields = () => {
  const { watch } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.DatadogApiKey;
    }
  >();

  const [{ name }, { apiKeyId, apiKey }] = watch(["parameters", "secretsMapping"]);

  return (
    <>
      <SecretRotationReviewSection label="Parameters">
        <GenericFieldLabel label="Key Name">{name}</GenericFieldLabel>
      </SecretRotationReviewSection>
      <SecretRotationReviewSection label="Secrets Mapping">
        <GenericFieldLabel label="API Key ID">{apiKeyId}</GenericFieldLabel>
        <GenericFieldLabel label="API Key">{apiKey}</GenericFieldLabel>
      </SecretRotationReviewSection>
    </>
  );
};
