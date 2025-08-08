import { useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

import { SecretRotationReviewSection } from "./shared";

export const AzureCertificateRotationReviewFields = () => {
  const { watch } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.AzureCertificate;
    }
  >();

  const [parameters, secretsMapping] = watch(["parameters", "secretsMapping"]);

  return (
    <>
      <SecretRotationReviewSection label="Parameters">
        <GenericFieldLabel label="App Name">{parameters.appName}</GenericFieldLabel>
        <GenericFieldLabel label="App ID">{parameters.objectId}</GenericFieldLabel>
      </SecretRotationReviewSection>
      <SecretRotationReviewSection label="Secrets Mapping">
        <GenericFieldLabel label="Public Key">{secretsMapping.publicKey}</GenericFieldLabel>
        {parameters.privateKey && <GenericFieldLabel label="Private Key">Yes</GenericFieldLabel>}
        {parameters.distinguishedName && (
          <GenericFieldLabel label="Distinguished Name">
            {parameters.distinguishedName}
          </GenericFieldLabel>
        )}
        {parameters.keyAlgorithm && (
          <GenericFieldLabel label="Key Algorithm">{parameters.keyAlgorithm}</GenericFieldLabel>
        )}
      </SecretRotationReviewSection>
    </>
  );
};
