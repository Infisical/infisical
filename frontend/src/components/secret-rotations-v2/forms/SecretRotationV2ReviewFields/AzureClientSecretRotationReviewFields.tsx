import { useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { ReviewField } from "@app/components/secret-rotations-v2/forms/shared";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

import { SecretRotationReviewSection } from "./shared";

export const AzureClientSecretRotationReviewFields = () => {
  const { watch } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.AzureClientSecret;
    }
  >();

  const [parameters, { clientId, clientSecret }] = watch(["parameters", "secretsMapping"]);

  return (
    <>
      <SecretRotationReviewSection label="Parameters">
        <ReviewField label="App Name">{parameters.appName}</ReviewField>
        <ReviewField label="App ID">{parameters.objectId}</ReviewField>
      </SecretRotationReviewSection>
      <SecretRotationReviewSection label="Secrets Mapping">
        <ReviewField label="Client ID">{clientId}</ReviewField>
        <ReviewField label="Client Secret">{clientSecret}</ReviewField>
      </SecretRotationReviewSection>
    </>
  );
};
