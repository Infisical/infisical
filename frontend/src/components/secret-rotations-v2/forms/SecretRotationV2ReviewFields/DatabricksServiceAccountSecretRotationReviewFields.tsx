import { useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { ReviewField } from "@app/components/secret-rotations-v2/forms/shared";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

import { SecretRotationReviewSection } from "./shared";

export const DatabricksServicePrincipalSecretRotationReviewFields = () => {
  const { watch } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.DatabricksServicePrincipalSecret;
    }
  >();

  const [parameters, { clientId, clientSecret }] = watch(["parameters", "secretsMapping"]);

  return (
    <>
      <SecretRotationReviewSection label="Parameters">
        <ReviewField label="Service Principal">
          {parameters.servicePrincipalName || parameters.servicePrincipalId}
        </ReviewField>
        {parameters.clientId && <ReviewField label="Client ID">{parameters.clientId}</ReviewField>}
      </SecretRotationReviewSection>
      <SecretRotationReviewSection label="Secrets Mapping">
        <ReviewField label="Client ID">{clientId}</ReviewField>
        <ReviewField label="Client Secret">{clientSecret}</ReviewField>
      </SecretRotationReviewSection>
    </>
  );
};
