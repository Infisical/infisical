import { ReactNode } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  Separator
} from "@app/components/v3";
import { SECRET_SYNC_INITIAL_SYNC_BEHAVIOR_MAP } from "@app/helpers/secretSyncs";
import { SecretSync, TSecretSync } from "@app/hooks/api/secretSyncs";

import { AwsParameterStoreSyncOptionsSection } from "./AwsParameterStoreSyncOptionsSection";
import { AwsSecretsManagerSyncOptionsSection } from "./AwsSecretsManagerSyncOptionsSection";
import { FlyioSyncOptionsSection } from "./FlyioSyncOptionsSection";
import { RenderSyncOptionsSection } from "./RenderSyncOptionsSection";
import { TriggerDevSyncOptionsSection } from "./TriggerDevSyncOptionsSection";

type Props = {
  secretSync: TSecretSync;
};

export const SecretSyncOptionsSection = ({ secretSync }: Props) => {
  const {
    destination,
    syncOptions: { initialSyncBehavior, disableSecretDeletion, keySchema }
  } = secretSync;

  let AdditionalSyncOptionsComponent: ReactNode;

  switch (destination) {
    case SecretSync.AWSParameterStore:
      AdditionalSyncOptionsComponent = (
        <AwsParameterStoreSyncOptionsSection secretSync={secretSync} />
      );
      break;
    case SecretSync.AWSSecretsManager:
      AdditionalSyncOptionsComponent = (
        <AwsSecretsManagerSyncOptionsSection secretSync={secretSync} />
      );
      break;
    case SecretSync.Render:
      AdditionalSyncOptionsComponent = <RenderSyncOptionsSection secretSync={secretSync} />;
      break;
    case SecretSync.Flyio:
      AdditionalSyncOptionsComponent = <FlyioSyncOptionsSection secretSync={secretSync} />;
      break;
    case SecretSync.TriggerDev:
      AdditionalSyncOptionsComponent = <TriggerDevSyncOptionsSection secretSync={secretSync} />;
      break;
    case SecretSync.GitHub:
    case SecretSync.GCPSecretManager:
    case SecretSync.AzureKeyVault:
    case SecretSync.AzureAppConfiguration:
    case SecretSync.AzureDevOps:
    case SecretSync.Databricks:
    case SecretSync.Humanitec:
    case SecretSync.TerraformCloud:
    case SecretSync.Camunda:
    case SecretSync.Vercel:
    case SecretSync.Windmill:
    case SecretSync.HCVault:
    case SecretSync.TeamCity:
    case SecretSync.OCIVault:
    case SecretSync.OnePass:
    case SecretSync.Heroku:
    case SecretSync.GitLab:
    case SecretSync.CloudflarePages:
    case SecretSync.CloudflareWorkers:
    case SecretSync.Zabbix:
    case SecretSync.Railway:
    case SecretSync.Supabase:
    case SecretSync.Checkly:
    case SecretSync.DigitalOceanAppPlatform:
    case SecretSync.Netlify:
    case SecretSync.Northflank:
    case SecretSync.Bitbucket:
    case SecretSync.LaravelForge:
    case SecretSync.Chef:
    case SecretSync.OctopusDeploy:
    case SecretSync.CircleCI:
    case SecretSync.AzureEntraIdScim:
    case SecretSync.ExternalInfisical:
    case SecretSync.OVH:
    case SecretSync.Devin:
    case SecretSync.Ona:
    case SecretSync.TravisCI:
    case SecretSync.Snowflake:
    case SecretSync.HasuraCloud:
    case SecretSync.Cloud66:
      AdditionalSyncOptionsComponent = null;
      break;
    default:
      throw new Error(`Unhandled Destination Review Fields: ${destination}`);
  }

  return (
    <>
      <Separator className="mt-4" />
      <Accordion type="multiple" variant="ghost">
        <AccordionItem value="sync-options">
          <AccordionTrigger>Sync Options</AccordionTrigger>
          <AccordionContent>
            <DetailGroup>
              <Detail>
                <DetailLabel>Initial Sync Behavior</DetailLabel>
                <DetailValue>
                  {SECRET_SYNC_INITIAL_SYNC_BEHAVIOR_MAP[initialSyncBehavior](destination).name}
                </DetailValue>
              </Detail>
              <Detail>
                <DetailLabel>Key Schema</DetailLabel>
                {keySchema ? (
                  <DetailValue>{keySchema}</DetailValue>
                ) : (
                  <DetailValue className="text-muted">—</DetailValue>
                )}
              </Detail>
              {AdditionalSyncOptionsComponent}
              {disableSecretDeletion && (
                <Detail>
                  <DetailLabel>Secret Deletion</DetailLabel>
                  <DetailValue>
                    <Badge variant="neutral">Disabled</Badge>
                  </DetailValue>
                </Detail>
              )}
            </DetailGroup>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </>
  );
};
