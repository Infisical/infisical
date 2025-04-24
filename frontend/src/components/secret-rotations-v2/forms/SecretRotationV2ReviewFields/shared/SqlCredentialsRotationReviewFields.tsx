import { useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
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
        <GenericFieldLabel label="Database Username 1">{username1}</GenericFieldLabel>
        <GenericFieldLabel label="Database Username 2">{username2}</GenericFieldLabel>
      </SecretRotationReviewSection>
      <SecretRotationReviewSection label="Secrets Mapping">
        <GenericFieldLabel label="Username">{username}</GenericFieldLabel>
        <GenericFieldLabel label="Password">{password}</GenericFieldLabel>
      </SecretRotationReviewSection>
    </>
  );
};
