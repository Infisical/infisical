import { useFormContext } from "react-hook-form";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

export const HpIloRotationReviewFields = () => {
  const { watch } = useFormContext<
    TSecretRotationV2Form & {
      type: SecretRotation.HpIloLocalAccount;
    }
  >();

  const parameters = watch("parameters");
  const secretsMapping = watch("secretsMapping");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-mineshaft-200">Parameters</h3>
        <div className="rounded-md border border-mineshaft-600 bg-mineshaft-800 p-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-mineshaft-400">Username</p>
              <p className="text-sm text-mineshaft-100">{parameters.username}</p>
            </div>
            <div>
              <p className="text-xs text-mineshaft-400">Rotation Method</p>
              <p className="text-sm text-mineshaft-100 capitalize">
                {parameters.rotationMethod?.replace(/-/g, " ") || "Login as target"}
              </p>
            </div>
            <div>
              <p className="text-xs text-mineshaft-400">Password Length</p>
              <p className="text-sm text-mineshaft-100">
                {parameters.passwordRequirements?.length || 32} characters
              </p>
            </div>
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-mineshaft-200">Secrets Mapping</h3>
        <div className="rounded-md border border-mineshaft-600 bg-mineshaft-800 p-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-mineshaft-400">Username Key</p>
              <p className="text-sm text-mineshaft-100">{secretsMapping.username}</p>
            </div>
            <div>
              <p className="text-xs text-mineshaft-400">Password Key</p>
              <p className="text-sm text-mineshaft-100">{secretsMapping.password}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
