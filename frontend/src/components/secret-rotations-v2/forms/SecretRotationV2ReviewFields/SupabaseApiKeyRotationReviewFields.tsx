import { useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import { SupabaseApiKeyType } from "@app/hooks/api/secretRotationsV2/types/supabase-api-key-rotation";

import { SecretRotationReviewSection } from "./shared";

const KEY_TYPE_LABELS: Record<SupabaseApiKeyType, string> = {
  [SupabaseApiKeyType.Publishable]: "Publishable",
  [SupabaseApiKeyType.Secret]: "Secret"
};

export const SupabaseApiKeyRotationReviewFields = () => {
  const { watch } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.SupabaseApiKey;
    }
  >();

  const [parameters, { apiKey }] = watch(["parameters", "secretsMapping"]);

  return (
    <>
      <SecretRotationReviewSection label="Parameters">
        <GenericFieldLabel label="Project Reference">{parameters.projectRef}</GenericFieldLabel>
        <GenericFieldLabel label="Key Type">
          {KEY_TYPE_LABELS[parameters.keyType] || parameters.keyType}
        </GenericFieldLabel>
      </SecretRotationReviewSection>
      <SecretRotationReviewSection label="Secrets Mapping">
        <GenericFieldLabel label="API Key">{apiKey}</GenericFieldLabel>
      </SecretRotationReviewSection>
    </>
  );
};
