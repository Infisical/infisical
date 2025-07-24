import { useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

import { SecretRotationReviewSection } from "./shared";

export const OktaClientSecretRotationReviewFields = () => {
  const { watch } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.OktaClientSecret;
    }
  >();

  const [parameters, { clientId, clientSecret }] = watch(["parameters", "secretsMapping"]);

  return (
    <>
      <SecretRotationReviewSection label="Parameters">
        <GenericFieldLabel label="App ID">{parameters.clientId}</GenericFieldLabel>
      </SecretRotationReviewSection>
      <SecretRotationReviewSection label="Secrets Mapping">
        <GenericFieldLabel label="Client ID">{clientId}</GenericFieldLabel>
        <GenericFieldLabel label="Client Secret">{clientSecret}</GenericFieldLabel>
      </SecretRotationReviewSection>
    </>
  );
};
