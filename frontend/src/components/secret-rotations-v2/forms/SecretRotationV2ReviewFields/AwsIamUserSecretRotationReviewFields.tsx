import { useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

import { SecretRotationReviewSection } from "./shared";

export const AwsIamUserSecretRotationReviewFields = () => {
  const { watch } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.AwsIamUserSecret;
    }
  >();

  const [parameters, { accessKeyId, secretAccessKey }] = watch(["parameters", "secretsMapping"]);

  return (
    <>
      <SecretRotationReviewSection label="Parameters">
        <GenericFieldLabel label="Region">{parameters.region}</GenericFieldLabel>
        <GenericFieldLabel label="User Name">{parameters.userName}</GenericFieldLabel>
      </SecretRotationReviewSection>
      <SecretRotationReviewSection label="Secrets Mapping">
        <GenericFieldLabel label="Secret Access Key ID">{accessKeyId}</GenericFieldLabel>
        <GenericFieldLabel label="Secret Access Key">{secretAccessKey}</GenericFieldLabel>
      </SecretRotationReviewSection>
    </>
  );
};
