import { ReactNode } from "react";
import { useFormContext } from "react-hook-form";

import { GenericFieldLabel } from "@app/components/secret-syncs";
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
import { CamundaSyncReviewFields } from "./CamundaSyncReviewFields";
import { DatabricksSyncReviewFields } from "./DatabricksSyncReviewFields";
import { GcpSyncReviewFields } from "./GcpSyncReviewFields";
import { GitHubSyncReviewFields } from "./GitHubSyncReviewFields";
import { HCVaultSyncReviewFields } from "./HCVaultSyncReviewFields";
import { HumanitecSyncReviewFields } from "./HumanitecSyncReviewFields";
import { TeamCitySyncReviewFields } from "./TeamCitySyncReviewFields";
import { TerraformCloudSyncReviewFields } from "./TerraformCloudSyncReviewFields";
import { VercelSyncReviewFields } from "./VercelSyncReviewFields";
import { WindmillSyncReviewFields } from "./WindmillSyncReviewFields";

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
    case SecretSync.TerraformCloud:
      DestinationFieldsComponent = <TerraformCloudSyncReviewFields />;
      break;
    case SecretSync.Camunda:
      DestinationFieldsComponent = <CamundaSyncReviewFields />;
      break;
    case SecretSync.Vercel:
      DestinationFieldsComponent = <VercelSyncReviewFields />;
      break;
    case SecretSync.Windmill:
      DestinationFieldsComponent = <WindmillSyncReviewFields />;
      break;
    case SecretSync.HCVault:
      DestinationFieldsComponent = <HCVaultSyncReviewFields />;
      break;
    case SecretSync.TeamCity:
      DestinationFieldsComponent = <TeamCitySyncReviewFields />;
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
          <GenericFieldLabel label="Environment">{environment.name}</GenericFieldLabel>
          <GenericFieldLabel label="Secret Path">{secretPath}</GenericFieldLabel>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="w-full border-b border-mineshaft-600">
          <span className="text-sm text-mineshaft-300">Destination</span>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <GenericFieldLabel label="Connection">{connection.name}</GenericFieldLabel>
          {DestinationFieldsComponent}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <div className="w-full border-b border-mineshaft-600">
          <span className="text-sm text-mineshaft-300">Sync Options</span>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-2">
          <GenericFieldLabel label="Auto-Sync">
            <Badge variant={isAutoSyncEnabled ? "success" : "danger"}>
              {isAutoSyncEnabled ? "Enabled" : "Disabled"}
            </Badge>
          </GenericFieldLabel>
          <GenericFieldLabel label="Initial Sync Behavior">
            {SECRET_SYNC_INITIAL_SYNC_BEHAVIOR_MAP[initialSyncBehavior](destinationName).name}
          </GenericFieldLabel>
          {/* <SecretSyncLabel label="Prepend Prefix">{prependPrefix}</SecretSyncLabel>
          <SecretSyncLabel label="Append Suffix">{appendSuffix}</SecretSyncLabel> */}
          {AdditionalSyncOptionsFieldsComponent}
          {disableSecretDeletion && (
            <GenericFieldLabel label="Secret Deletion">
              <Badge variant="primary">Disabled</Badge>
            </GenericFieldLabel>
          )}
        </div>
      </div>
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
