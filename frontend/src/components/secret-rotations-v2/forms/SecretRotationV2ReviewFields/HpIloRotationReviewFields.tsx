import { useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { ReviewField } from "@app/components/secret-rotations-v2/forms/shared";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

import { SecretRotationReviewSection } from "./shared";

export const HpIloRotationReviewFields = () => {
  const { watch } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.HpIloLocalAccount;
    }
  >();

  const parameters = watch("parameters");
  const secretsMapping = watch("secretsMapping");

  return (
    <>
      <SecretRotationReviewSection label="Parameters">
        <ReviewField label="Username">{parameters.username}</ReviewField>
        <ReviewField label="Rotation Method">
          {parameters.rotationMethod?.replace(/-/g, " ") || "Login as target"}
        </ReviewField>
        <ReviewField label="Password Length">
          {parameters.passwordRequirements?.length || 32} characters
        </ReviewField>
      </SecretRotationReviewSection>
      <SecretRotationReviewSection label="Secrets Mapping">
        <ReviewField label="Username Key">{secretsMapping.username}</ReviewField>
        <ReviewField label="Password Key">{secretsMapping.password}</ReviewField>
      </SecretRotationReviewSection>
    </>
  );
};
