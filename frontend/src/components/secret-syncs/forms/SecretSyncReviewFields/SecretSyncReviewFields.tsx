import { ReactNode } from "react";
import { useFormContext } from "react-hook-form";
import { TriangleAlert } from "lucide-react";

import { TSecretSyncForm } from "@app/components/secret-syncs/forms/schemas";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Detail,
  DetailGroup,
  DetailGroupHeader,
  DetailLabel,
  DetailValue
} from "@app/components/v3";
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
import { AzureEntraIdScimSyncReviewFields } from "./AzureEntraIdScimSyncReviewFields";
import { AzureKeyVaultSyncReviewFields } from "./AzureKeyVaultSyncReviewFields";
import { BitbucketSyncReviewFields } from "./BitbucketSyncReviewFields";
import { CamundaSyncReviewFields } from "./CamundaSyncReviewFields";
import { ChecklySyncReviewFields } from "./ChecklySyncReviewFields";
import { ChefSyncReviewFields } from "./ChefSyncReviewFields";
import { CircleCISyncReviewFields } from "./CircleCISyncReviewFields";
import { CloudflarePagesSyncReviewFields } from "./CloudflarePagesReviewFields";
import { CloudflareWorkersSyncReviewFields } from "./CloudflareWorkersReviewFields";
import { DatabricksSyncReviewFields } from "./DatabricksSyncReviewFields";
import { DevinSyncReviewFields } from "./DevinSyncReviewFields";
import { DigitalOceanAppPlatformSyncReviewFields } from "./DigitalOceanAppPlatformSyncReviewFields";
import { ExternalInfisicalSyncReviewFields } from "./ExternalInfisicalSyncReviewFields";
import { FlyioSyncOptionsReviewFields, FlyioSyncReviewFields } from "./FlyioSyncReviewFields";
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
import { OnaSyncReviewFields } from "./OnaSyncReviewFields";
import { OnePassSyncReviewFields } from "./OnePassSyncReviewFields";
import { OvhSyncReviewFields } from "./OvhSyncReviewFields";
import { RailwaySyncReviewFields } from "./RailwaySyncReviewFields";
import { RenderSyncOptionsReviewFields, RenderSyncReviewFields } from "./RenderSyncReviewFields";
import { SnowflakeSyncReviewFields } from "./SnowflakeSyncReviewFields";
import { SupabaseSyncReviewFields } from "./SupabaseSyncReviewFields";
import { TeamCitySyncReviewFields } from "./TeamCitySyncReviewFields";
import { TerraformCloudSyncReviewFields } from "./TerraformCloudSyncReviewFields";
import { TravisCISyncReviewFields } from "./TravisCISyncReviewFields";
import {
  TriggerDevSyncOptionsReviewFields,
  TriggerDevSyncReviewFields
} from "./TriggerDevSyncReviewFields";
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
      AdditionalSyncOptionsFieldsComponent = <FlyioSyncOptionsReviewFields />;
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
    case SecretSync.CircleCI:
      DestinationFieldsComponent = <CircleCISyncReviewFields />;
      break;
    case SecretSync.AzureEntraIdScim:
      DestinationFieldsComponent = <AzureEntraIdScimSyncReviewFields />;
      break;
    case SecretSync.ExternalInfisical:
      DestinationFieldsComponent = <ExternalInfisicalSyncReviewFields />;
      break;
    case SecretSync.OVH:
      DestinationFieldsComponent = <OvhSyncReviewFields />;
      break;
    case SecretSync.Devin:
      DestinationFieldsComponent = <DevinSyncReviewFields />;
      break;
    case SecretSync.Ona:
      DestinationFieldsComponent = <OnaSyncReviewFields />;
      break;
    case SecretSync.TravisCI:
      DestinationFieldsComponent = <TravisCISyncReviewFields />;
      break;
    case SecretSync.Snowflake:
      DestinationFieldsComponent = <SnowflakeSyncReviewFields />;
      break;
    case SecretSync.TriggerDev:
      DestinationFieldsComponent = <TriggerDevSyncReviewFields />;
      AdditionalSyncOptionsFieldsComponent = <TriggerDevSyncOptionsReviewFields />;
      break;
    default:
      throw new Error(`Unhandled Destination Review Fields: ${destination}`);
  }

  return (
    <div className="mb-4 flex flex-col gap-y-8">
      <DetailGroup>
        <DetailGroupHeader className="border-b border-border pb-2">Source</DetailGroupHeader>
        <div className="flex flex-wrap gap-x-8 gap-y-4">
          <Detail>
            <DetailLabel>Environment</DetailLabel>
            <DetailValue>{environment.name}</DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Secret Path</DetailLabel>
            <DetailValue>{secretPath}</DetailValue>
          </Detail>
        </div>
      </DetailGroup>

      <DetailGroup>
        <DetailGroupHeader className="border-b border-border pb-2">
          Destination
          {isChecking && <span className="ml-2 text-xs font-normal text-muted">Checking...</span>}
        </DetailGroupHeader>

        {hasDuplicate && (
          <Alert variant={currentOrg?.blockDuplicateSecretSyncDestinations ? "danger" : "warning"}>
            <TriangleAlert />
            <AlertTitle>
              {currentOrg?.blockDuplicateSecretSyncDestinations
                ? "Duplicate destination blocked"
                : "Duplicate destination detected"}
            </AlertTitle>
            <AlertDescription>
              <p>
                {currentOrg?.blockDuplicateSecretSyncDestinations
                  ? "Another secret sync in your organization is already configured with the same destination. Your organization does not allow duplicate destination configurations."
                  : "Another secret sync in your organization is already configured with the same destination. This may lead to conflicts or unexpected behavior."}
              </p>
              {duplicateProjectId && (
                <p>
                  Duplicate found in project ID:{" "}
                  <code className="rounded-sm bg-foreground/10 px-1 py-0.5 font-mono">
                    {duplicateProjectId}
                  </code>
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap gap-x-8 gap-y-4">
          <Detail>
            <DetailLabel>Connection</DetailLabel>
            <DetailValue>{connection.name}</DetailValue>
          </Detail>
          {DestinationFieldsComponent}
        </div>
      </DetailGroup>

      <DetailGroup>
        <DetailGroupHeader className="border-b border-border pb-2">Sync Options</DetailGroupHeader>

        <div className="flex flex-wrap gap-x-8 gap-y-4">
          <Detail>
            <DetailLabel>Auto-Sync</DetailLabel>
            <DetailValue>
              <Badge variant={isAutoSyncEnabled ? "success" : "neutral"}>
                {isAutoSyncEnabled ? "Enabled" : "Disabled"}
              </Badge>
            </DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Initial Sync Behavior</DetailLabel>
            <DetailValue>
              {SECRET_SYNC_INITIAL_SYNC_BEHAVIOR_MAP[initialSyncBehavior](destinationName).name}
            </DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Key Schema</DetailLabel>
            {keySchema ? (
              <DetailValue>{keySchema}</DetailValue>
            ) : (
              <DetailValue className="text-muted italic">None</DetailValue>
            )}
          </Detail>
          {AdditionalSyncOptionsFieldsComponent}
          {disableSecretDeletion && (
            <Detail>
              <DetailLabel>Secret Deletion</DetailLabel>
              <DetailValue>
                <Badge variant="warning">Disabled</Badge>
              </DetailValue>
            </Detail>
          )}
        </div>
      </DetailGroup>

      <DetailGroup>
        <DetailGroupHeader className="border-b border-border pb-2">Details</DetailGroupHeader>
        <div className="flex flex-wrap gap-x-8 gap-y-4">
          <Detail>
            <DetailLabel>Name</DetailLabel>
            <DetailValue>{name}</DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Description</DetailLabel>
            {description ? (
              <DetailValue>{description}</DetailValue>
            ) : (
              <DetailValue className="text-muted italic">None</DetailValue>
            )}
          </Detail>
        </div>
      </DetailGroup>
    </div>
  );
};
