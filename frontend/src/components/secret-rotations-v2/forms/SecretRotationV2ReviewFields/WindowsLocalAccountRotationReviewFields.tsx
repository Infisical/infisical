import { useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

import { SecretRotationReviewSection } from "./shared";

export const WindowsLocalAccountRotationReviewFields = () => {
  const { watch } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.WindowsLocalAccount;
    }
  >();

  const [parameters, { username, password }] = watch(["parameters", "secretsMapping"]);

  const { passwordRequirements } = parameters;

  return (
    <>
      <SecretRotationReviewSection label="Parameters">
        <GenericFieldLabel label="Username">{parameters.username}</GenericFieldLabel>
      </SecretRotationReviewSection>
      {passwordRequirements && (
        <SecretRotationReviewSection label="Password Requirements">
          <GenericFieldLabel label="Length">{passwordRequirements.length}</GenericFieldLabel>
          <GenericFieldLabel label="Minimum Digits">
            {passwordRequirements.required.digits}
          </GenericFieldLabel>
          <GenericFieldLabel label="Minimum Lowercase Characters">
            {passwordRequirements.required.lowercase}
          </GenericFieldLabel>
          <GenericFieldLabel label="Minimum Uppercase Characters">
            {passwordRequirements.required.uppercase}
          </GenericFieldLabel>
          <GenericFieldLabel label="Minimum Symbols">
            {passwordRequirements.required.symbols}
          </GenericFieldLabel>
          <GenericFieldLabel label="Allowed Symbols">
            {passwordRequirements.allowedSymbols}
          </GenericFieldLabel>
        </SecretRotationReviewSection>
      )}
      <SecretRotationReviewSection label="Secrets Mapping">
        <GenericFieldLabel label="Username">{username}</GenericFieldLabel>
        <GenericFieldLabel label="Password">{password}</GenericFieldLabel>
      </SecretRotationReviewSection>
    </>
  );
};
