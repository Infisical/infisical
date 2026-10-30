import { useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { ReviewField } from "@app/components/secret-rotations-v2/forms/shared";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

import { SecretRotationReviewSection } from "./shared";

export const UnixLinuxLocalAccountRotationReviewFields = () => {
  const { watch } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.UnixLinuxLocalAccount;
    }
  >();

  const [parameters, { username, password }] = watch(["parameters", "secretsMapping"]);

  const { passwordRequirements } = parameters;

  return (
    <>
      <SecretRotationReviewSection label="Parameters">
        <ReviewField label="Username">{parameters.username}</ReviewField>
        <ReviewField label="Use Sudo">{parameters.useSudo ? "Yes" : "No"}</ReviewField>
      </SecretRotationReviewSection>
      {passwordRequirements && (
        <SecretRotationReviewSection label="Password Requirements">
          <ReviewField label="Length">{passwordRequirements.length}</ReviewField>
          <ReviewField label="Minimum Digits">{passwordRequirements.required.digits}</ReviewField>
          <ReviewField label="Minimum Lowercase Characters">
            {passwordRequirements.required.lowercase}
          </ReviewField>
          <ReviewField label="Minimum Uppercase Characters">
            {passwordRequirements.required.uppercase}
          </ReviewField>
          <ReviewField label="Minimum Symbols">{passwordRequirements.required.symbols}</ReviewField>
          <ReviewField label="Allowed Symbols">{passwordRequirements.allowedSymbols}</ReviewField>
        </SecretRotationReviewSection>
      )}
      <SecretRotationReviewSection label="Secrets Mapping">
        <ReviewField label="Username">{username}</ReviewField>
        <ReviewField label="Password">{password}</ReviewField>
      </SecretRotationReviewSection>
    </>
  );
};
