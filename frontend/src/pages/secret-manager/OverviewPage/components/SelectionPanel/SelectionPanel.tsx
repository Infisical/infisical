import { useMemo } from "react";
import { subject } from "@casl/ability";
import { FolderInputIcon, TagsIcon, TrashIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission,
  useSubscription
} from "@app/context";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { usePopUp } from "@app/hooks";
import { useDeleteSecretBatch } from "@app/hooks/api";
import { ProjectSecretsImportedBy, UsedBySecretSyncs } from "@app/hooks/api/dashboard/types";
import { ProjectEnv } from "@app/hooks/api/projects/types";
import { PendingAction } from "@app/hooks/api/secretFolders/types";
import { useCreateCommit } from "@app/hooks/api/secrets/mutations";
import {
  SecretType,
  SecretV3RawSanitized,
  TDeleteSecretBatchDTO,
  TSecretFolder
} from "@app/hooks/api/types";
import {
  BulkDeleteDialog,
  BulkTagDialog,
  MoveSecretsModal
} from "@app/pages/secret-manager/OverviewPage/components/SelectionPanel/components";

export enum EntryType {
  FOLDER = "folder",
  SECRET = "secret"
}

type Props = {
  secretPath: string;
  resetSelectedEntries: () => void;
  selectedEntries: {
    [EntryType.FOLDER]: Record<string, Record<string, TSecretFolder>>;
    [EntryType.SECRET]: Record<string, Record<string, SecretV3RawSanitized>>;
  };
  importedBy?: ProjectSecretsImportedBy[] | null;
  usedBySecretSyncs?: UsedBySecretSyncs[];
  secretsToDeleteKeys: string[];
  visibleEnvs: ProjectEnv[];
};

export const SelectionPanel = ({
  secretPath,
  resetSelectedEntries,
  selectedEntries,
  importedBy,
  secretsToDeleteKeys,
  usedBySecretSyncs = [],
  visibleEnvs
}: Props) => {
  const { permission } = useProjectPermission();
  const { subscription } = useSubscription();

  const { handlePopUpOpen, handlePopUpToggle, handlePopUpClose, popUp } = usePopUp([
    "bulkDeleteEntries",
    "bulkMoveSecrets",
    "bulkTagSecrets"
  ] as const);

  const selectedFolderCount = Object.keys(selectedEntries.folder).length;
  const selectedKeysCount = Object.keys(selectedEntries.secret).length;
  const isRotatedSecretSelected = Object.values(selectedEntries.secret).some((record) =>
    Object.values(record).some((secret) => secret.isRotatedSecret)
  );
  const selectedCount = selectedFolderCount + selectedKeysCount;

  const { currentProject, projectId } = useProject();
  const userAvailableEnvs = currentProject?.environments || [];
  const { mutateAsync: deleteBatchSecretV3 } = useDeleteSecretBatch();
  const { mutateAsync: createCommit } = useCreateCommit();

  const isMultiSelectActive = selectedCount > 0;

  // user should have the ability to delete secrets/folders in at least one of the envs
  const shouldShowDelete = userAvailableEnvs.some((env) =>
    permission.can(
      ProjectPermissionSecretActions.Delete,
      subject(ProjectPermissionSub.Secrets, {
        environment: env.slug,
        secretPath,
        secretName: "*",
        secretTags: ["*"]
      })
    )
  );

  const canEditSecretsInAnyEnv = userAvailableEnvs.some((env) =>
    permission.can(
      ProjectPermissionSecretActions.Edit,
      subject(ProjectPermissionSub.Secrets, {
        environment: env.slug,
        secretPath,
        secretName: "*",
        secretTags: ["*"]
      })
    )
  );
  const canReadTags = permission.can(ProjectPermissionActions.Read, ProjectPermissionSub.Tags);
  const isTagActionDisabled = !canEditSecretsInAnyEnv || !canReadTags;

  const usedBySecretSyncsFiltered = useMemo(() => {
    if (selectedKeysCount === 0 || usedBySecretSyncs.length === 0) return null;
    const envs = Object.values(selectedEntries.secret).flatMap((entries) => Object.keys(entries));
    return usedBySecretSyncs.filter((syncItem) => envs.includes(syncItem.environment));
  }, [selectedEntries, usedBySecretSyncs, selectedKeysCount]);

  const getDeleteModalTitle = () => {
    if (selectedFolderCount > 0 && selectedKeysCount > 0) {
      return "Do you want to delete the selected secrets and folders across the following environments?";
    }
    if (selectedKeysCount > 0) {
      return "Do you want to delete the selected secrets across the following environments?";
    }
    return "Do you want to delete the selected folders across the following environments?";
  };

  const getDeleteModalSubTitle = () => {
    if (selectedFolderCount > 0) {
      if (subscription?.pitRecovery) {
        return "All selected folders and their contents will be removed. You can reverse this action by rolling back to a previous commit.";
      }
      return "All selected folders and their contents will be removed. Rolling back to a previous commit isn't available on your current plan. Upgrade to enable this feature.";
    }
    return undefined;
  };

  const handleBulkDelete = async () => {
    let processedEntries = 0;
    let hasApprovalRequest = false;
    let hasDirectDelete = false;
    const hasFolders = selectedFolderCount > 0;
    const hasSecrets = selectedKeysCount > 0;

    const promises = userAvailableEnvs.map(async (env) => {
      // additional check: ensure that bulk delete is only executed on envs that user has access to

      if (
        permission.can(
          ProjectPermissionActions.Delete,
          subject(ProjectPermissionSub.SecretFolders, { environment: env.slug, secretPath })
        )
      ) {
        const folderDeletes = Object.values(selectedEntries.folder)
          .map((folderRecord) => folderRecord[env.slug])
          .filter((folder): folder is TSecretFolder => Boolean(folder))
          .map((folder) => ({
            id: folder.id,
            timestamp: Date.now(),
            resourceType: "folder" as const,
            type: PendingAction.Delete as const,
            folderName: folder.name,
            folderPath: secretPath
          }));

        if (folderDeletes.length > 0) {
          processedEntries += folderDeletes.length;
          hasDirectDelete = true;
          await createCommit({
            projectId,
            environment: env.slug,
            secretPath,
            pendingChanges: {
              secrets: [],
              folders: folderDeletes
            },
            message: `Deleted ${folderDeletes.length} folder${folderDeletes.length === 1 ? "" : "s"}`
          });
        }
      }

      const secretsToDelete = Object.values(selectedEntries.secret).reduce(
        (accum: TDeleteSecretBatchDTO["secrets"], secretRecord) => {
          const entry = secretRecord[env.slug];
          if (!entry) return accum;
          const canDeleteSecret = permission.can(
            ProjectPermissionSecretActions.Delete,
            subject(ProjectPermissionSub.Secrets, {
              environment: env.slug,
              secretPath,
              secretName: entry.key,
              secretTags: (entry?.tags || []).map((i) => i.slug)
            })
          );

          if (entry && canDeleteSecret && !entry.isRotatedSecret) {
            return [
              ...accum,
              {
                secretKey: entry.key,
                type: SecretType.Shared
              }
            ];
          }
          return accum;
        },
        []
      );

      if (secretsToDelete.length > 0) {
        processedEntries += secretsToDelete.length;
        const result = await deleteBatchSecretV3({
          secretPath,
          projectId,
          environment: env.slug,
          secrets: secretsToDelete
        });

        if (result && "approval" in result) {
          hasApprovalRequest = true;
        } else {
          hasDirectDelete = true;
        }
      }

      return {
        environment: env.slug
      };
    });

    const results = await Promise.allSettled(promises);
    const areAllEntriesDeleted = results.every((result) => result.status === "fulfilled");
    const areSomeEntriesDeleted = results.some((result) => result.status === "fulfilled");

    let resourceLabel = "secrets";
    if (hasFolders && hasSecrets) {
      resourceLabel = "secrets and folders";
    } else if (hasFolders) {
      resourceLabel = "folders";
    }

    const failedEnvs = userAvailableEnvs
      .filter(
        (env) =>
          !results.some(
            (result) => result.status === "fulfilled" && result.value.environment === env.slug
          )
      )
      .map((env) => env.name);
    if (processedEntries === 0) {
      handlePopUpClose("bulkDeleteEntries");
      createNotification({
        type: "info",
        text: "You don't have access to delete selected items"
      });
    } else if (areAllEntriesDeleted) {
      handlePopUpClose("bulkDeleteEntries");
      resetSelectedEntries();
      if (hasDirectDelete && hasApprovalRequest) {
        createNotification({
          type: "info",
          text: `Some ${resourceLabel} were deleted and an approval request was generated for protected environments`
        });
      } else if (hasApprovalRequest) {
        createNotification({
          type: "info",
          text: `An approval request has been generated for the selected ${resourceLabel}`
        });
      } else {
        createNotification({
          type: "success",
          text: `Successfully deleted selected ${resourceLabel}`
        });
      }
    } else if (areSomeEntriesDeleted) {
      createNotification({
        type: "warning",
        text: `Deletion partially completed. The following environments could not be processed due to conflicts: ${failedEnvs.join(", ")}.`
      });
    } else {
      createNotification({
        type: "error",
        text: `Failed to delete selected ${resourceLabel}`
      });
    }
  };

  const areFoldersSelected = Boolean(Object.keys(selectedEntries[EntryType.FOLDER]).length);

  return (
    <>
      <div
        className={twMerge(
          "mb-2 h-0 shrink-0 overflow-hidden transition-all",
          isMultiSelectActive && "h-16"
        )}
      >
        <div className="mt-3.5 flex items-center rounded-md border border-border bg-card p-2 pl-4 text-foreground">
          <div className="mr-2 text-sm">{selectedCount} Selected</div>
          <button
            type="button"
            className="mt-0.5 mr-auto text-xs text-accent underline-offset-2 hover:underline"
            onClick={resetSelectedEntries}
          >
            Unselect All
          </button>
          {isRotatedSecretSelected && (
            <span className="text-xs text-accent">
              Rotated Secrets will not be affected by move or delete action.
            </span>
          )}
          {selectedKeysCount > 0 && (
            <Tooltip open={isTagActionDisabled ? undefined : false}>
              <TooltipTrigger>
                <Button
                  isDisabled={isTagActionDisabled}
                  variant="project"
                  className="ml-2"
                  onClick={() => handlePopUpOpen("bulkTagSecrets")}
                  size="xs"
                >
                  <TagsIcon />
                  Tags
                </Button>
              </TooltipTrigger>
              <TooltipContent>Access denied</TooltipContent>
            </Tooltip>
          )}
          {shouldShowDelete && (
            <>
              <Tooltip open={areFoldersSelected ? undefined : false}>
                <TooltipTrigger>
                  <Button
                    isDisabled={areFoldersSelected}
                    variant="project"
                    className="ml-2"
                    onClick={() => handlePopUpOpen("bulkMoveSecrets")}
                    size="xs"
                  >
                    <FolderInputIcon />
                    Move
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Moving folders is not supported</TooltipContent>
              </Tooltip>
              <Button
                variant="danger"
                className="ml-2"
                onClick={() => handlePopUpOpen("bulkDeleteEntries")}
                size="xs"
              >
                <TrashIcon />
                Delete
              </Button>
            </>
          )}
        </div>
      </div>
      <MoveSecretsModal
        isOpen={popUp.bulkMoveSecrets.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("bulkMoveSecrets", isOpen)}
        environments={userAvailableEnvs}
        visibleEnvs={visibleEnvs}
        projectId={projectId}
        projectSlug={currentProject.slug}
        sourceSecretPath={secretPath}
        secrets={selectedEntries[EntryType.SECRET]}
        onComplete={resetSelectedEntries}
      />
      <BulkTagDialog
        isOpen={popUp.bulkTagSecrets.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("bulkTagSecrets", isOpen)}
        projectId={projectId}
        secretPath={secretPath}
        secrets={selectedEntries[EntryType.SECRET]}
        environments={userAvailableEnvs}
        visibleEnvs={visibleEnvs}
        onComplete={resetSelectedEntries}
      />
      <BulkDeleteDialog
        isOpen={popUp.bulkDeleteEntries.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("bulkDeleteEntries", isOpen)}
        title={getDeleteModalTitle()}
        subTitle={getDeleteModalSubTitle()}
        onDeleteApproved={handleBulkDelete}
        selectedEntries={selectedEntries}
        visibleEnvs={visibleEnvs}
        importedBy={importedBy}
        secretsToDeleteKeys={secretsToDeleteKeys}
        usedBySecretSyncsFiltered={usedBySecretSyncsFiltered}
      />
    </>
  );
};
