import { useFormContext } from "react-hook-form";

import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

import { TSecretRotationV2Form } from "../schemas";
import { SqlRotationParametersFields } from "./shared";

const COMPONENT_MAP: Record<SecretRotation, React.FC> = {
  [SecretRotation.PostgresCredentials]: SqlRotationParametersFields,
  [SecretRotation.MsSqlCredentials]: SqlRotationParametersFields
};

export const SecretRotationV2ParametersFields = () => {
  const { watch } = useFormContext<TSecretRotationV2Form>();

  const rotationType = watch("type");

  const Component = COMPONENT_MAP[rotationType];

  return (
    <>
      <p className="mb-4 text-sm text-bunker-300">
        Configure the required parameters for this Secret Rotation.
      </p>
      <Component />
    </>
  );
};
