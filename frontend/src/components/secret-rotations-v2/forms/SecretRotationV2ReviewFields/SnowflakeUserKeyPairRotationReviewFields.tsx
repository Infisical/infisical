import { useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

import { SecretRotationReviewSection } from "./shared";

export const SnowflakeUserKeyPairRotationReviewFields = () => {
  const { watch } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.SnowflakeUserKeyPair;
    }
  >();

  const [{ username }, { privateKey, publicKey }] = watch(["parameters", "secretsMapping"]);

  return (
    <>
      <SecretRotationReviewSection label="Parameters">
        <GenericFieldLabel label="User">{username}</GenericFieldLabel>
      </SecretRotationReviewSection>
      <SecretRotationReviewSection label="Secrets Mapping">
        <GenericFieldLabel label="Private Key">{privateKey}</GenericFieldLabel>
        <GenericFieldLabel label="Public Key">{publicKey}</GenericFieldLabel>
      </SecretRotationReviewSection>
    </>
  );
};
