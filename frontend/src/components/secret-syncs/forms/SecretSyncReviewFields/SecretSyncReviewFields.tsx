import { ReactNode } from "react";
import { useFormContext } from "react-hook-form";

import { SecretSyncLabel } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Badge } from "@app/components/v2";
import { SECRET_SYNC_INITIAL_SYNC_BEHAVIOR_MAP, SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import { SecretSync } from "@app/hooks/api/secretSyncs";

import {
  AwsParameterStoreDestinationReviewFields,
  AwsParameterStoreSyncOptionsReviewFields
} from "./AwsParameterStoreSyncReviewFields";
import {
  AwsSecretsManagerSyncOptionsReviewFields,
  AwsSecretsManagerSyncReviewFields
} from "./AwsSecretsManagerSyncReviewFields";
import { AzureAppConfigurationSyncReviewFields } from "./AzureAppConfigurationSyncReviewFields";
import { AzureKeyVaultSyncReviewFields } from "./AzureKeyVaultSyncReviewFields";
import { DatabricksSyncReviewFields } from "./DatabricksSyncReviewFields";
import { GcpSyncReviewFields } from "./GcpSyncReviewFields";
import { GitHubSyncReviewFields } from "./GitHubSyncReviewFields";
import { HumanitecSyncReviewFields } from "./HumanitecSyncReviewFields";

export const SecretSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm>();

  let DestinationFieldsComponent: ReactNode;
  let AdditionalSyncOptionsFieldsComponent: ReactNode;

  const {
    name,
    description,
    connection,
    environment,
    secretPath,
    syncOptions: {
      // appendSuffix, prependPrefix,
      disableSecretDeletion,
      initialSyncBehavior
    },
    destination,
    isAutoSyncEnabled
  } = watch();

  const destinationName = SECRET_SYNC_MAP[destination].name;

  switch (destination) {
    case SecretSync.AWSParameterStore:
      DestinationFieldsComponent = <AwsParameterStoreDestinationReviewFields />;
      AdditionalSyncOptionsFieldsComponent = <AwsParameterStoreSyncOptionsReviewFields />;
      break;
    case SecretSync.AWSSecretsManager:
      DestinationFieldsComponent = <AwsSecretsManagerSyncReviewFields />;
      AdditionalSyncOptionsFieldsComponent = <AwsSecretsManagerSyncOptionsReviewFields />;
      break;
    case SecretSync.GitHub:
      DestinationFieldsComponent = <GitHubSyncReviewFields />;
      break;
    case SecretSync.GCPSecretManager:
      DestinationFieldsComponent = <GcpSyncReviewFields />;
      break;
    case SecretSync.AzureKeyVault:
      DestinationFieldsComponent = <AzureKeyVaultSyncReviewFields />;
      break;
    case SecretSync.AzureAppConfiguration:
      DestinationFieldsComponent = <AzureAppConfigurationSyncReviewFields />;
      break;
    case SecretSync.Databricks:
      DestinationFieldsComponent = <DatabricksSyncReviewFields />;
      break;
    case SecretSync.Humanitec:
      DestinationFieldsComponent = <HumanitecSyncReviewFields />;
      break;
    default:
      throw new Error(`Unhandled Destination Review Fields: ${destination}`);
  }

  return (
    <div className="mb-4 flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="w-full border-b border-mineshaft-600">
          <span className="text-sm text-mineshaft-300">Source</span>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <SecretSyncLabel label="Environment">{environment.name}</SecretSyncLabel>
          <SecretSyncLabel label="Secret Path">{secretPath}</SecretSyncLabel>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="w-full border-b border-mineshaft-600">
          <span className="text-sm text-mineshaft-300">Destination</span>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <SecretSyncLabel label="Connection">{connection.name}</SecretSyncLabel>
          {DestinationFieldsComponent}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="w-full border-b border-mineshaft-600">
          <span className="text-sm text-mineshaft-300">Sync Options</span>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <SecretSyncLabel label="Auto-Sync">
            <Badge variant={isAutoSyncEnabled ? "success" : "danger"}>
              {isAutoSyncEnabled ? "Enabled" : "Disabled"}
            </Badge>
          </SecretSyncLabel>
          <SecretSyncLabel label="Initial Sync Behavior">
            {SECRET_SYNC_INITIAL_SYNC_BEHAVIOR_MAP[initialSyncBehavior](destinationName).name}
          </SecretSyncLabel>
          {/* <SecretSyncLabel label="Prepend Prefix">{prependPrefix}</SecretSyncLabel>
          <SecretSyncLabel label="Append Suffix">{appendSuffix}</SecretSyncLabel> */}
          {AdditionalSyncOptionsFieldsComponent}
          {disableSecretDeletion && (
            <SecretSyncLabel label="Secret Deletion">
              <Badge variant="primary">Disabled</Badge>
            </SecretSyncLabel>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="w-full border-b border-mineshaft-600">
          <span className="text-sm text-mineshaft-300">Details</span>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <SecretSyncLabel label="Name">{name}</SecretSyncLabel>
          <SecretSyncLabel label="Description">{description}</SecretSyncLabel>
        </div>
      </div>
    </div>
  );
};
