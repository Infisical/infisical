import { useFormContext } from "react-hook-form";

import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

import { TSecretRotationV2Form } from "../schemas";
import { SqlRotationSecretsMappingFields } from "./shared";

const COMPONENT_MAP: Record<SecretRotation, React.FC> = {
  [SecretRotation.PostgresCredentials]: SqlRotationSecretsMappingFields,
  [SecretRotation.MsSqlCredentials]: SqlRotationSecretsMappingFields
};

export const SecretRotationV2SecretsMappingFields = () => {
  const { watch } = useFormContext<TSecretRotationV2Form>();

  const rotationType = watch("type");

  const Component = COMPONENT_MAP[rotationType];

  return (
    <>
      <p className="mb-4 text-sm text-bunker-300">
        Map the rotated credentials to secrets in your Infisical project.
      </p>
      <Component />
    </>
  );
};
