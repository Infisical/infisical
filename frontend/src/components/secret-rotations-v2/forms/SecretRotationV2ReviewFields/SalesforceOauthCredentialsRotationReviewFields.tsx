import { useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
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
        <GenericFieldLabel label="External Client App">{parameters.appName}</GenericFieldLabel>
      </SecretRotationReviewSection>
      <SecretRotationReviewSection label="Secrets Mapping">
        <GenericFieldLabel label="Consumer Key">{consumerKey}</GenericFieldLabel>
        <GenericFieldLabel label="Consumer Secret">{consumerSecret}</GenericFieldLabel>
      </SecretRotationReviewSection>
    </>
  );
};
