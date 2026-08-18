import { useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { ReviewField } from "@app/components/secret-rotations-v2/forms/shared";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

import { SecretRotationReviewSection } from "./shared";

export const LdapPasswordRotationReviewFields = () => {
  const { watch } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.LdapPassword;
    }
  >();

  const [parameters, { dn, password }] = watch(["parameters", "secretsMapping"]);

  const { passwordRequirements } = parameters;

  return (
    <>
      <SecretRotationReviewSection label="Parameters">
        <ReviewField label="DN/UPN">{parameters.dn}</ReviewField>
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
        <ReviewField label="DN/UPN">{dn}</ReviewField>
        <ReviewField label="Password">{password}</ReviewField>
      </SecretRotationReviewSection>
    </>
  );
};
