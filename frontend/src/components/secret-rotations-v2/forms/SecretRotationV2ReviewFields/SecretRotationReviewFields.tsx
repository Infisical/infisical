import { useFormContext } from "react-hook-form";
import { format } from "date-fns";

import { TSecretRotationV2Form } from "@app/components/secret-rotations-v2/forms/schemas";
import { GenericFieldLabel } from "@app/components/v2";
import { getRotateAtLocal } from "@app/helpers/secretRotationsV2";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";

import { Auth0ClientSecretRotationReviewFields } from "./Auth0ClientSecretRotationReviewFields";
import { AwsIamUserSecretRotationReviewFields } from "./AwsIamUserSecretRotationReviewFields";
import { AzureClientSecretRotationReviewFields } from "./AzureClientSecretRotationReviewFields";
import { LdapPasswordRotationReviewFields } from "./LdapPasswordRotationReviewFields";
import { OktaClientSecretRotationReviewFields } from "./OktaClientSecretRotationReviewFields";
import { SqlCredentialsRotationReviewFields } from "./shared";

const COMPONENT_MAP: Record<SecretRotation, React.FC> = {
  [SecretRotation.PostgresCredentials]: SqlCredentialsRotationReviewFields,
  [SecretRotation.MsSqlCredentials]: SqlCredentialsRotationReviewFields,
  [SecretRotation.MySqlCredentials]: SqlCredentialsRotationReviewFields,
  [SecretRotation.OracleDBCredentials]: SqlCredentialsRotationReviewFields,
  [SecretRotation.Auth0ClientSecret]: Auth0ClientSecretRotationReviewFields,
  [SecretRotation.AzureClientSecret]: AzureClientSecretRotationReviewFields,
  [SecretRotation.LdapPassword]: LdapPasswordRotationReviewFields,
  [SecretRotation.AwsIamUserSecret]: AwsIamUserSecretRotationReviewFields,
  [SecretRotation.OktaClientSecret]: OktaClientSecretRotationReviewFields
};

export const SecretRotationV2ReviewFields = () => {
  const { watch } = useFormContext<TSecretRotationV2Form>();

  const {
    environment,
    secretPath,
    connection,
    type,
    name,
    description,
    rotationInterval,
    rotateAtUtc
  } = watch();

  const Component = COMPONENT_MAP[type];

  return (
    <div className="mb-4 flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="w-full border-b border-mineshaft-600">
          <span className="text-sm text-mineshaft-300">Configuration</span>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <GenericFieldLabel label="Connection">{connection.name}</GenericFieldLabel>
          <GenericFieldLabel label="Environment">{environment.name}</GenericFieldLabel>
          <GenericFieldLabel label="Secret Path">{secretPath}</GenericFieldLabel>
          <GenericFieldLabel label="Rotation Interval">
            {rotationInterval} Day{rotationInterval > 1 ? "s" : ""}
          </GenericFieldLabel>
          <GenericFieldLabel label="Rotate At">
            {format(getRotateAtLocal(rotateAtUtc), "h:mm aa")}
          </GenericFieldLabel>
        </div>
      </div>
      <Component />
      <div className="flex flex-col gap-3">
        <div className="w-full border-b border-mineshaft-600">
          <span className="text-sm text-mineshaft-300">Details</span>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <GenericFieldLabel label="Name">{name}</GenericFieldLabel>
          <GenericFieldLabel label="Description">{description}</GenericFieldLabel>
        </div>
      </div>
    </div>
  );
};
