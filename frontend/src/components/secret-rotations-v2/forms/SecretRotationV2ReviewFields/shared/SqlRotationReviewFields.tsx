import { useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const SqlRotationReviewFields = () => {
  const { watch } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.PostgresCredentials; // all sql rotations share these fields
    }
  >();

  const [{ username1, username2 }, { username, password }] = watch([
    "parameters",
    "secretsMapping"
  ]);

  return (
    <>
      <div className="flex flex-col gap-3">
        <div className="w-full border-b border-mineshaft-600">
          <span className="text-sm text-mineshaft-300">Parameters</span>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <GenericFieldLabel label="Database Username 1">{username1}</GenericFieldLabel>
          <GenericFieldLabel label="Database Username 2">{username2}</GenericFieldLabel>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="w-full border-b border-mineshaft-600">
          <span className="text-sm text-mineshaft-300">Secrets Mapping</span>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <GenericFieldLabel label="Username">{username}</GenericFieldLabel>
          <GenericFieldLabel label="Password">{password}</GenericFieldLabel>
        </div>
      </div>
    </>
  );
};
