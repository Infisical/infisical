import { ReactNode } from "react";
import { subject } from "@casl/ability";
import { faEdit } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ProjectPermissionCan } from "@app/components/permissions";
import { GenericFieldLabel } from "@app/components/secret-syncs";
import { Badge, IconButton } from "@app/components/v2";
import { ProjectPermissionSub } from "@app/context";
import { ProjectPermissionSecretSyncActions } from "@app/context/ProjectPermissionContext/types";
import { SECRET_SYNC_INITIAL_SYNC_BEHAVIOR_MAP } from "@app/helpers/secretSyncs";
import { SecretSync, TSecretSync } from "@app/hooks/api/secretSyncs";

import { AwsParameterStoreSyncOptionsSection } from "./AwsParameterStoreSyncOptionsSection";
import { AwsSecretsManagerSyncOptionsSection } from "./AwsSecretsManagerSyncOptionsSection";

type Props = {
  secretSync: TSecretSync;
  onEditOptions: VoidFunction;
};

export const SecretSyncOptionsSection = ({ secretSync, onEditOptions }: Props) => {
  const {
    destination,
    syncOptions: { initialSyncBehavior, disableSecretDeletion, keySchema },
    environment,
    folder
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
    case SecretSync.Render:
    case SecretSync.Flyio:
    case SecretSync.GitLab:
    case SecretSync.CloudflarePages:
    case SecretSync.Zabbix:
      AdditionalSyncOptionsComponent = null;
      break;
    default:
      throw new Error(`Unhandled Destination Review Fields: ${destination}`);
  }

  const permissionSubject =
    environment && folder
      ? subject(ProjectPermissionSub.SecretSyncs, {
          environment: environment.slug,
          secretPath: folder.path
        })
      : ProjectPermissionSub.SecretSyncs;

  return (
    <div>
      <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
        <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
          <h3 className="font-semibold text-mineshaft-100">Sync Options</h3>
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
                <Badge variant="primary">Disabled</Badge>
              </GenericFieldLabel>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
