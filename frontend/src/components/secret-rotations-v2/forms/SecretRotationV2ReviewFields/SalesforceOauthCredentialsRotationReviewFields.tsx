import { useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { ReviewField } from "@app/components/secret-rotations-v2/forms/shared";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

import { SecretRotationReviewSection } from "./shared";

export const SalesforceOauthCredentialsRotationReviewFields = () => {
  const { watch } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.SalesforceOauthCredentials;
    }
  >();

  const [parameters, { consumerKey, consumerSecret }] = watch(["parameters", "secretsMapping"]);

  return (
    <>
      <SecretRotationReviewSection label="Parameters">
        <ReviewField label="External Client App">{parameters.appName}</ReviewField>
      </SecretRotationReviewSection>
      <SecretRotationReviewSection label="Secrets Mapping">
        <ReviewField label="Consumer Key">{consumerKey}</ReviewField>
        <ReviewField label="Consumer Secret">{consumerSecret}</ReviewField>
      </SecretRotationReviewSection>
    </>
  );
};
