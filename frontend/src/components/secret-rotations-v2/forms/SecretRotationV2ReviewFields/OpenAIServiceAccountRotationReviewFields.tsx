import { useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

import { SecretRotationReviewSection } from "./shared";

export const OpenAIServiceAccountRotationReviewFields = () => {
  const { watch } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.OpenAIServiceAccount;
    }
  >();

  const [parameters, { apiKey }] = watch(["parameters", "secretsMapping"]);

  return (
    <>
      <SecretRotationReviewSection label="Parameters">
        <GenericFieldLabel label="Project ID">{parameters.projectId}</GenericFieldLabel>
        <GenericFieldLabel label="Service Account Name">{parameters.name}</GenericFieldLabel>
      </SecretRotationReviewSection>
      <SecretRotationReviewSection label="Secrets Mapping">
        <GenericFieldLabel label="API Key">{apiKey}</GenericFieldLabel>
      </SecretRotationReviewSection>
    </>
  );
};
