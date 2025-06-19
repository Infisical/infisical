import { useFormContext } from "react-hook-form";

import { SecretSync } from "@app/hooks/api/secretSyncs";

import { TSecretSyncForm } from "../schemas";
import { OnePassSyncFields } from "./1PasswordSyncFields";
import { AwsParameterStoreSyncFields } from "./AwsParameterStoreSyncFields";
import { AwsSecretsManagerSyncFields } from "./AwsSecretsManagerSyncFields";
import { AzureAppConfigurationSyncFields } from "./AzureAppConfigurationSyncFields";
import { AzureDevOpsSyncFields } from "./AzureDevOpsSyncFields";
import { AzureKeyVaultSyncFields } from "./AzureKeyVaultSyncFields";
import { CamundaSyncFields } from "./CamundaSyncFields";
import { DatabricksSyncFields } from "./DatabricksSyncFields";
import { FlyioSyncFields } from "./FlyioSyncFields";
import { GcpSyncFields } from "./GcpSyncFields";
import { GitHubSyncFields } from "./GitHubSyncFields";
import { HCVaultSyncFields } from "./HCVaultSyncFields";
import { HerokuSyncFields } from "./HerokuSyncFields";
import { HumanitecSyncFields } from "./HumanitecSyncFields";
import { OCIVaultSyncFields } from "./OCIVaultSyncFields";
import { RenderSyncFields } from "./RenderSyncFields";
import { TeamCitySyncFields } from "./TeamCitySyncFields";
import { TerraformCloudSyncFields } from "./TerraformCloudSyncFields";
import { VercelSyncFields } from "./VercelSyncFields";
import { WindmillSyncFields } from "./WindmillSyncFields";

export const SecretSyncDestinationFields = () => {
  const { watch } = useFormContext<TSecretSyncForm>();

  const destination = watch("destination");

  switch (destination) {
    case SecretSync.AWSParameterStore:
      return <AwsParameterStoreSyncFields />;
    case SecretSync.AWSSecretsManager:
      return <AwsSecretsManagerSyncFields />;
    case SecretSync.GitHub:
      return <GitHubSyncFields />;
    case SecretSync.GCPSecretManager:
      return <GcpSyncFields />;
    case SecretSync.AzureKeyVault:
      return <AzureKeyVaultSyncFields />;
    case SecretSync.AzureAppConfiguration:
      return <AzureAppConfigurationSyncFields />;
    case SecretSync.AzureDevOps:
      return <AzureDevOpsSyncFields />;
    case SecretSync.Databricks:
      return <DatabricksSyncFields />;
    case SecretSync.Humanitec:
      return <HumanitecSyncFields />;
    case SecretSync.TerraformCloud:
      return <TerraformCloudSyncFields />;
    case SecretSync.Camunda:
      return <CamundaSyncFields />;
    case SecretSync.Vercel:
      return <VercelSyncFields />;
    case SecretSync.Windmill:
      return <WindmillSyncFields />;
    case SecretSync.HCVault:
      return <HCVaultSyncFields />;
    case SecretSync.TeamCity:
      return <TeamCitySyncFields />;
    case SecretSync.OCIVault:
      return <OCIVaultSyncFields />;
    case SecretSync.OnePass:
      return <OnePassSyncFields />;
    case SecretSync.Heroku:
      return <HerokuSyncFields />;
    case SecretSync.Render:
      return <RenderSyncFields />;
    case SecretSync.Flyio:
      return <FlyioSyncFields />;
    default:
      throw new Error(`Unhandled Destination Config Field: ${destination}`);
  }
};
