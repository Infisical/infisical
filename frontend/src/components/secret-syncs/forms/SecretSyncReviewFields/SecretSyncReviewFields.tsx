import { ReactNode } from "react";
import { useFormContext } from "react-hook-form";
import { faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { GenericFieldLabel } from "@app/components/secret-syncs";
import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import { Badge } from "@app/components/v3";
import { useOrganization, useProject } from "@app/context";
import { SECRET_SYNC_INITIAL_SYNC_BEHAVIOR_MAP, SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import { SecretSync, useDuplicateDestinationCheck } from "@app/hooks/api/secretSyncs";

import {
  AwsParameterStoreDestinationReviewFields,
  AwsParameterStoreSyncOptionsReviewFields
} from "./AwsParameterStoreSyncReviewFields";
import {
  AwsSecretsManagerSyncOptionsReviewFields,
  AwsSecretsManagerSyncReviewFields
} from "./AwsSecretsManagerSyncReviewFields";
import { AzureAppConfigurationSyncReviewFields } from "./AzureAppConfigurationSyncReviewFields";
import { AzureDevOpsSyncReviewFields } from "./AzureDevOpsSyncReviewFields";
import { AzureKeyVaultSyncReviewFields } from "./AzureKeyVaultSyncReviewFields";
import { BitbucketSyncReviewFields } from "./BitbucketSyncReviewFields";
import { CamundaSyncReviewFields } from "./CamundaSyncReviewFields";
import { ChecklySyncReviewFields } from "./ChecklySyncReviewFields";
import { ChefSyncReviewFields } from "./ChefSyncReviewFields";
import { CloudflarePagesSyncReviewFields } from "./CloudflarePagesReviewFields";
import { CloudflareWorkersSyncReviewFields } from "./CloudflareWorkersReviewFields";
import { DatabricksSyncReviewFields } from "./DatabricksSyncReviewFields";
import { DigitalOceanAppPlatformSyncReviewFields } from "./DigitalOceanAppPlatformSyncReviewFields";
import { FlyioSyncReviewFields } from "./FlyioSyncReviewFields";
import { GcpSyncReviewFields } from "./GcpSyncReviewFields";
import { GitHubSyncReviewFields } from "./GitHubSyncReviewFields";
import { GitLabSyncReviewFields } from "./GitLabSyncReviewFields";
import { HCVaultSyncReviewFields } from "./HCVaultSyncReviewFields";
import { HerokuSyncReviewFields } from "./HerokuSyncReviewFields";
import { HumanitecSyncReviewFields } from "./HumanitecSyncReviewFields";
import { LaravelForgeSyncReviewFields } from "./LaravelForgeSyncReviewFields";
import { NetlifySyncReviewFields } from "./NetlifySyncReviewFields";
import { NorthflankSyncReviewFields } from "./NorthflankSyncReviewFields";
import { OCIVaultSyncReviewFields } from "./OCIVaultSyncReviewFields";
import { OctopusDeploySyncReviewFields } from "./OctopusDeploySyncReviewFields";
import { OnePassSyncReviewFields } from "./OnePassSyncReviewFields";
import { RailwaySyncReviewFields } from "./RailwaySyncReviewFields";
import { RenderSyncOptionsReviewFields, RenderSyncReviewFields } from "./RenderSyncReviewFields";
import { SupabaseSyncReviewFields } from "./SupabaseSyncReviewFields";
import { TeamCitySyncReviewFields } from "./TeamCitySyncReviewFields";
import { TerraformCloudSyncReviewFields } from "./TerraformCloudSyncReviewFields";
import { VercelSyncReviewFields } from "./VercelSyncReviewFields";
import { WindmillSyncReviewFields } from "./WindmillSyncReviewFields";
import { ZabbixSyncReviewFields } from "./ZabbixSyncReviewFields";

export const SecretSyncReviewFields = () => {
  const { watch } = useFormContext<TSecretSyncForm>();
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();

  let DestinationFieldsComponent: ReactNode;
  let AdditionalSyncOptionsFieldsComponent: ReactNode;

  const {
    name,
    description,
    connection,
    environment,
    secretPath,
    syncOptions: { disableSecretDeletion, initialSyncBehavior, keySchema },
    destination,
    isAutoSyncEnabled
  } = watch();

  const destinationName = SECRET_SYNC_MAP[destination].name;

  const { hasDuplicate, duplicateProjectId, isChecking } = useDuplicateDestinationCheck({
    destination,
    projectId: currentProject?.id || "",
    enabled: true,
    destinationConfig: watch("destinationConfig")
  });

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
    case SecretSync.AzureDevOps:
      DestinationFieldsComponent = <AzureDevOpsSyncReviewFields />;
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
    case SecretSync.OCIVault:
      DestinationFieldsComponent = <OCIVaultSyncReviewFields />;
      break;
    case SecretSync.OnePass:
      DestinationFieldsComponent = <OnePassSyncReviewFields />;
      break;
    case SecretSync.Heroku:
      DestinationFieldsComponent = <HerokuSyncReviewFields />;
      break;
    case SecretSync.Render:
      DestinationFieldsComponent = <RenderSyncReviewFields />;
      AdditionalSyncOptionsFieldsComponent = <RenderSyncOptionsReviewFields />;
      break;
    case SecretSync.Flyio:
      DestinationFieldsComponent = <FlyioSyncReviewFields />;
      break;
    case SecretSync.GitLab:
      DestinationFieldsComponent = <GitLabSyncReviewFields />;
      break;
    case SecretSync.CloudflarePages:
      DestinationFieldsComponent = <CloudflarePagesSyncReviewFields />;
      break;
    case SecretSync.CloudflareWorkers:
      DestinationFieldsComponent = <CloudflareWorkersSyncReviewFields />;
      break;
    case SecretSync.Zabbix:
      DestinationFieldsComponent = <ZabbixSyncReviewFields />;
      break;
    case SecretSync.Railway:
      DestinationFieldsComponent = <RailwaySyncReviewFields />;
      break;
    case SecretSync.Checkly:
      DestinationFieldsComponent = <ChecklySyncReviewFields />;
      break;
    case SecretSync.Supabase:
      DestinationFieldsComponent = <SupabaseSyncReviewFields />;
      break;
    case SecretSync.DigitalOceanAppPlatform:
      DestinationFieldsComponent = <DigitalOceanAppPlatformSyncReviewFields />;
      break;
    case SecretSync.Netlify:
      DestinationFieldsComponent = <NetlifySyncReviewFields />;
      break;
    case SecretSync.Northflank:
      DestinationFieldsComponent = <NorthflankSyncReviewFields />;
      break;
    case SecretSync.Bitbucket:
      DestinationFieldsComponent = <BitbucketSyncReviewFields />;
      break;
    case SecretSync.LaravelForge:
      DestinationFieldsComponent = <LaravelForgeSyncReviewFields />;
      break;
    case SecretSync.Chef:
      DestinationFieldsComponent = <ChefSyncReviewFields />;
      break;
    case SecretSync.OctopusDeploy:
      DestinationFieldsComponent = <OctopusDeploySyncReviewFields />;
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
        <div className="flex w-full items-center gap-2 border-b border-mineshaft-600">
          <span className="text-sm text-mineshaft-300">Destination</span>
          {isChecking && <span className="text-xs text-mineshaft-400">Checking...</span>}
        </div>
        {hasDuplicate && (
          <div
            className={`mb-2 flex items-start rounded-md border px-3 py-2 ${
              currentOrg?.blockDuplicateSecretSyncDestinations
                ? "border-red-600 bg-red-900/20"
                : "border-yellow-600 bg-yellow-900/20"
            }`}
          >
            <div
              className={`flex text-sm ${
                currentOrg?.blockDuplicateSecretSyncDestinations
                  ? "text-red-100"
                  : "text-yellow-100"
              }`}
            >
              <FontAwesomeIcon
                icon={faWarning}
                className={`mt-1 mr-2 ${
                  currentOrg?.blockDuplicateSecretSyncDestinations
                    ? "text-red-600"
                    : "text-yellow-600"
                }`}
              />
              <div>
                <p>
                  {currentOrg?.blockDuplicateSecretSyncDestinations
                    ? "Another secret sync in your organization is already configured with the same destination. Your organization does not allow duplicate destination configurations."
                    : "Another secret sync in your organization is already configured with the same destination. This may lead to conflicts or unexpected behavior."}
                </p>
                {duplicateProjectId && (
                  <p
                    className={`mt-1 text-xs ${
                      currentOrg?.blockDuplicateSecretSyncDestinations
                        ? "text-red-200"
                        : "text-yellow-200"
                    }`}
                  >
                    Duplicate found in project ID:{" "}
                    <code
                      className={`rounded-sm px-1 py-0.5 ${
                        currentOrg?.blockDuplicateSecretSyncDestinations
                          ? "bg-red-800/50"
                          : "bg-yellow-800/50"
                      }`}
                    >
                      {duplicateProjectId}
                    </code>
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
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
            <Badge variant={isAutoSyncEnabled ? "success" : "neutral"}>
              {isAutoSyncEnabled ? "Enabled" : "Disabled"}
            </Badge>
          </GenericFieldLabel>
          <GenericFieldLabel label="Initial Sync Behavior">
            {SECRET_SYNC_INITIAL_SYNC_BEHAVIOR_MAP[initialSyncBehavior](destinationName).name}
          </GenericFieldLabel>
          <GenericFieldLabel label="Key Schema">{keySchema}</GenericFieldLabel>
          {AdditionalSyncOptionsFieldsComponent}
          {disableSecretDeletion && (
            <GenericFieldLabel label="Secret Deletion">
              <Badge variant="warning">Disabled</Badge>
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
