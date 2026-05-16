import { useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

import { SecretRotationReviewSection } from "./shared";

export const DatadogApplicationKeySecretRotationReviewFields = () => {
  const { watch } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.DatadogApplicationKeySecret;
    }
  >();

  const [parameters, { applicationKeyId, applicationKey }] = watch([
    "parameters",
    "secretsMapping"
  ]);

  return (
    <>
      <SecretRotationReviewSection label="Parameters">
        <GenericFieldLabel label="Service Account ID">
          {parameters.serviceAccountId}
        </GenericFieldLabel>
      </SecretRotationReviewSection>
      <SecretRotationReviewSection label="Secrets Mapping">
        <GenericFieldLabel label="Application Key ID">{applicationKeyId}</GenericFieldLabel>
        <GenericFieldLabel label="Application Key">{applicationKey}</GenericFieldLabel>
      </SecretRotationReviewSection>
    </>
  );
};
