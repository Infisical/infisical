import { useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { ReviewField } from "@app/components/secret-rotations-v2/forms/shared";
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
        <ReviewField label="Project Reference">{parameters.projectRef}</ReviewField>
        <ReviewField label="Key Type">
          {KEY_TYPE_LABELS[parameters.keyType] || parameters.keyType}
        </ReviewField>
      </SecretRotationReviewSection>
      <SecretRotationReviewSection label="Secrets Mapping">
        <ReviewField label="API Key">{apiKey}</ReviewField>
      </SecretRotationReviewSection>
    </>
  );
};
