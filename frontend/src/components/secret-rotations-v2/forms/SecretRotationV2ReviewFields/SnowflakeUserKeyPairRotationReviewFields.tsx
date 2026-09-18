import { useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { ReviewField } from "@app/components/secret-rotations-v2/forms/shared";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

import { SecretRotationReviewSection } from "./shared";

export const SnowflakeUserKeyPairRotationReviewFields = () => {
  const { watch } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.SnowflakeUserKeyPair;
    }
  >();

  const [{ username, modulusLength }, { privateKey, publicKey }] = watch([
    "parameters",
    "secretsMapping"
  ]);

  return (
    <>
      <SecretRotationReviewSection label="Parameters">
        <ReviewField label="User">{username}</ReviewField>
        <ReviewField label="RSA Modulus Length">{`${modulusLength}-bit`}</ReviewField>
      </SecretRotationReviewSection>
      <SecretRotationReviewSection label="Secrets Mapping">
        <ReviewField label="Private Key">{privateKey}</ReviewField>
        <ReviewField label="Public Key">{publicKey}</ReviewField>
      </SecretRotationReviewSection>
    </>
  );
};
