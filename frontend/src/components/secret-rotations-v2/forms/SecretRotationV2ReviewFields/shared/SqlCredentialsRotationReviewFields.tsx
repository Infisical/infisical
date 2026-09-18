import { useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { ReviewField } from "@app/components/secret-rotations-v2/forms/shared";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

import { SecretRotationReviewSection } from "./SecretRotationReviewSection";

export const SqlCredentialsRotationReviewFields = () => {
  const { watch } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.PostgresCredentials | SecretRotation.MsSqlCredentials;
    }
  >();

  const [{ username1, username2 }, { username, password }] = watch([
    "parameters",
    "secretsMapping"
  ]);

  return (
    <>
      <SecretRotationReviewSection label="Parameters">
        <ReviewField label="Database Username 1">{username1}</ReviewField>
        <ReviewField label="Database Username 2">{username2}</ReviewField>
      </SecretRotationReviewSection>
      <SecretRotationReviewSection label="Secrets Mapping">
        <ReviewField label="Username">{username}</ReviewField>
        <ReviewField label="Password">{password}</ReviewField>
      </SecretRotationReviewSection>
    </>
  );
};
