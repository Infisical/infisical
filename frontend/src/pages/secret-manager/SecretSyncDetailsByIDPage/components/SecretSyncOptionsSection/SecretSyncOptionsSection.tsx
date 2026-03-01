import { ReactNode } from "react";
import { faEdit } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ProjectPermissionCan } from "@app/components/permissions";
import { GenericFieldLabel } from "@app/components/secret-syncs";
import { IconButton } from "@app/components/v2";
import { Badge } from "@app/components/v3";
import { ProjectPermissionSecretSyncActions } from "@app/context/ProjectPermissionContext/types";
import { SECRET_SYNC_INITIAL_SYNC_BEHAVIOR_MAP } from "@app/helpers/secretSyncs";
import { SecretSync, TSecretSync } from "@app/hooks/api/secretSyncs";
import { getSecretSyncPermissionSubject } from "@app/lib/fn/permission";

import { AwsParameterStoreSyncOptionsSection } from "./AwsParameterStoreSyncOptionsSection";
import { AwsSecretsManagerSyncOptionsSection } from "./AwsSecretsManagerSyncOptionsSection";
import { FlyioSyncOptionsSection } from "./FlyioSyncOptionsSection";
import { RenderSyncOptionsSection } from "./RenderSyncOptionsSection";

type Props = {
  secretSync: TSecretSync;
  onEditOptions: VoidFunction;
};

export const SecretSyncOptionsSection = ({ secretSync, onEditOptions }: Props) => {
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
    case SecretSync.Koyeb:
      AdditionalSyncOptionsComponent = null;
      break;
    default:
      throw new Error(`Unhandled Destination Review Fields: ${destination}`);
  }

  const permissionSubject = getSecretSyncPermissionSubject(secretSync);

  return (
    <div>
      <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
        <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
          <h3 className="font-medium text-mineshaft-100">Sync Options</h3>
          <ProjectPermissionCan I={ProjectPermissionSecretSyncActions.Edit} a={permissionSubject}>
            {(isAllowed) => (
              <IconButton
                variant="plain"
                colorSchema="secondary"
                isDisabled={!isAllowed}
                ariaLabel="Edit sync options"
                onClick={onEditOptions}
              >
                <FontAwesomeIcon icon={faEdit} />
              </IconButton>
            )}
          </ProjectPermissionCan>
        </div>
        <div>
          <div className="space-y-3">
            <GenericFieldLabel label="Initial Sync Behavior">
              {SECRET_SYNC_INITIAL_SYNC_BEHAVIOR_MAP[initialSyncBehavior](destination).name}
            </GenericFieldLabel>
            <GenericFieldLabel label="Key Schema">{keySchema}</GenericFieldLabel>
            {AdditionalSyncOptionsComponent}
            {disableSecretDeletion && (
              <GenericFieldLabel label="Secret Deletion">
                <Badge variant="neutral">Disabled</Badge>
              </GenericFieldLabel>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
