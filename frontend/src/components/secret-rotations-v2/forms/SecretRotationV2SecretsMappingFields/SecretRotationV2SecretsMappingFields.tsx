import { useFormContext } from "react-hook-form";

import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

import { TSecretRotationV2Form } from "../schemas";
import { Auth0ClientSecretRotationSecretsMappingFields } from "./Auth0ClientSecretRotationSecretsMappingFields";
import { SqlCredentialsRotationSecretsMappingFields } from "./shared";

const COMPONENT_MAP: Record<SecretRotation, React.FC> = {
  [SecretRotation.PostgresCredentials]: SqlCredentialsRotationSecretsMappingFields,
  [SecretRotation.MsSqlCredentials]: SqlCredentialsRotationSecretsMappingFields,
  [SecretRotation.Auth0ClientSecret]: Auth0ClientSecretRotationSecretsMappingFields
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
