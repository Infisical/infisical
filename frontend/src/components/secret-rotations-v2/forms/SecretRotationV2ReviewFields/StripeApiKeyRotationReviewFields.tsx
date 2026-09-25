import { useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { ReviewField } from "@app/components/secret-rotations-v2/forms/shared";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

import { SecretRotationReviewSection } from "./shared";

const MAX_PERMISSIONS_PREVIEW = 5;

const summarizePermissions = (permissions: string[]) => {
  if (!permissions.length) return undefined;

  const preview = permissions.slice(0, MAX_PERMISSIONS_PREVIEW).join(", ");
  const remaining = permissions.length - MAX_PERMISSIONS_PREVIEW;

  return remaining > 0
    ? `${permissions.length} selected: ${preview}, +${remaining} more`
    : `${permissions.length} selected: ${preview}`;
};

export const StripeApiKeyRotationReviewFields = () => {
  const { watch } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.StripeApiKey;
    }
  >();

  const [parameters, { apiKey }] = watch(["parameters", "secretsMapping"]);

  return (
    <>
      <SecretRotationReviewSection label="Parameters">
        {Boolean(parameters.permissions?.length) && (
          <ReviewField label="Permissions">
            {summarizePermissions(parameters.permissions ?? [])}
          </ReviewField>
        )}
        {Boolean(parameters.connectPermissions?.length) && (
          <ReviewField label="Connect Permissions">
            {summarizePermissions(parameters.connectPermissions ?? [])}
          </ReviewField>
        )}
      </SecretRotationReviewSection>
      <SecretRotationReviewSection label="Secrets Mapping">
        <ReviewField label="API Key">{apiKey}</ReviewField>
      </SecretRotationReviewSection>
    </>
  );
};
