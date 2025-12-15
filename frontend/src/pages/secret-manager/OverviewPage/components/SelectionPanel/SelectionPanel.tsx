import { useMemo } from "react";
import { subject } from "@casl/ability";
import { faAnglesRight, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { Button, DeleteActionModal, Tooltip } from "@app/components/v2";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission,
  useSubscription
} from "@app/context";
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { usePopUp } from "@app/hooks";
import { useDeleteFolder, useDeleteSecretBatch } from "@app/hooks/api";
import { ProjectSecretsImportedBy, UsedBySecretSyncs } from "@app/hooks/api/dashboard/types";
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";
import {
  SecretType,
  SecretV3RawSanitized,
  TDeleteSecretBatchDTO,
  TSecretFolder
} from "@app/hooks/api/types";
import { MoveSecretsModal } from "@app/pages/secret-manager/OverviewPage/components/SelectionPanel/components";
import { CollapsibleSecretImports } from "@app/pages/secret-manager/SecretDashboardPage/components/SecretListView/CollapsibleSecretImports";

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
};

export const SelectionPanel = ({
  secretPath,
  resetSelectedEntries,
  selectedEntries,
  importedBy,
  secretsToDeleteKeys,
  usedBySecretSyncs = []
}: Props) => {
  const { permission } = useProjectPermission();
  const { subscription } = useSubscription();

  const { handlePopUpOpen, handlePopUpToggle, handlePopUpClose, popUp } = usePopUp([
    "bulkDeleteEntries",
    "bulkMoveSecrets"
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
  const { mutateAsync: deleteFolder } = useDeleteFolder();

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

  const usedBySecretSyncsFiltered = useMemo(() => {
    if (selectedKeysCount === 0 || usedBySecretSyncs.length === 0) return null;
    const envs = Object.values(selectedEntries.secret).flatMap((entries) => Object.keys(entries));
    return usedBySecretSyncs.filter((syncItem) => envs.includes(syncItem.environment));
  }, [selectedEntries, usedBySecretSyncs, selectedKeysCount]);

  const getDeleteModalTitle = () => {
    if (selectedFolderCount > 0 && selectedKeysCount > 0) {
      return "Do you want to delete the selected secrets and folders across environments?";
    }
    if (selectedKeysCount > 0) {
      return "Do you want to delete the selected secrets across environments?";
    }
    return "Do you want to delete the selected folders across environments?";
  };

  const getDeleteModalSubTitle = () => {
    if (selectedFolderCount > 0) {
      if (subscription?.get(SubscriptionProductCategory.SecretManager, "pitRecovery")) {
        return "All selected folders and their contents will be removed. You can reverse this action by rolling back to a previous commit.";
      }
      return "All selected folders and their contents will be removed. Rolling back to a previous commit isn't available on your current plan. Upgrade to enable this feature.";
    }
    return undefined;
  };

  const handleBulkDelete = async () => {
    let processedEntries = 0;

    const promises = userAvailableEnvs.map(async (env) => {
      // additional check: ensure that bulk delete is only executed on envs that user has access to

      if (
        permission.can(
          ProjectPermissionActions.Delete,
          subject(ProjectPermissionSub.SecretFolders, { environment: env.slug, secretPath })
        )
      ) {
        await Promise.all(
          Object.values(selectedEntries.folder).map(async (folderRecord) => {
            const folder = folderRecord[env.slug];
            if (folder) {
              processedEntries += 1;
              await deleteFolder({
                folderId: folder?.id,
                path: secretPath,
                environment: env.slug,
                projectId
              });
            }
          })
        );
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
        await deleteBatchSecretV3({
          secretPath,
          projectId,
          environment: env.slug,
          secrets: secretsToDelete
        });
      }

      return {
        environment: env.slug
      };
    });

    const results = await Promise.allSettled(promises);
    const areAllEntriesDeleted = results.every((result) => result.status === "fulfilled");
    const areSomeEntriesDeleted = results.some((result) => result.status === "fulfilled");

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
      createNotification({
        type: "success",
        text: "Successfully deleted selected secrets and folders"
      });
    } else if (areSomeEntriesDeleted) {
      createNotification({
        type: "warning",
        text: `Deletion partially completed. The following environments could not be processed due to conflicts: ${failedEnvs.join(", ")}.`
      });
    } else {
      createNotification({
        type: "error",
        text: "Failed to delete selected secrets and folders"
      });
    }
  };

  const areFoldersSelected = Boolean(Object.keys(selectedEntries[EntryType.FOLDER]).length);

  return (
    <>
      <div
        className={twMerge(
          "h-0 shrink-0 overflow-hidden transition-all",
          isMultiSelectActive && "h-16"
        )}
      >
        <div className="mt-3.5 flex items-center rounded-md border border-mineshaft-600 bg-mineshaft-800 px-4 py-2 text-bunker-300">
          <div className="mr-2 text-sm">{selectedCount} Selected</div>
          <button
            type="button"
            className="mr-auto text-xs text-mineshaft-400 underline-offset-2 hover:text-mineshaft-200 hover:underline"
            onClick={resetSelectedEntries}
          >
            Unselect All
          </button>
          {isRotatedSecretSelected && (
            <span className="text-sm text-mineshaft-400">
              Rotated Secrets will not be affected by action.
            </span>
          )}
          {shouldShowDelete && (
            <>
              <Tooltip content={areFoldersSelected ? "Moving folders is not supported" : undefined}>
                <div>
                  <Button
                    isDisabled={areFoldersSelected}
                    variant="outline_bg"
                    colorSchema="primary"
                    leftIcon={<FontAwesomeIcon icon={faAnglesRight} />}
                    className="ml-4"
                    onClick={() => handlePopUpOpen("bulkMoveSecrets")}
                    size="xs"
                  >
                    Move
                  </Button>
                </div>
              </Tooltip>
              <Button
                variant="outline_bg"
                colorSchema="danger"
                leftIcon={<FontAwesomeIcon icon={faTrash} />}
                className="ml-4"
                onClick={() => handlePopUpOpen("bulkDeleteEntries")}
                size="xs"
              >
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
        projectId={projectId}
        projectSlug={currentProject.slug}
        sourceSecretPath={secretPath}
        secrets={selectedEntries[EntryType.SECRET]}
        onComplete={resetSelectedEntries}
      />
      <DeleteActionModal
        isOpen={popUp.bulkDeleteEntries.isOpen}
        deleteKey="delete"
        title={getDeleteModalTitle()}
        subTitle={getDeleteModalSubTitle()}
        onChange={(isOpen) => handlePopUpToggle("bulkDeleteEntries", isOpen)}
        onDeleteApproved={handleBulkDelete}
        formContent={
          ((usedBySecretSyncsFiltered && usedBySecretSyncsFiltered.length > 0) ||
            (importedBy && importedBy.some((element) => element.folders.length > 0))) && (
            <CollapsibleSecretImports
              importedBy={importedBy || []}
              secretsToDelete={secretsToDeleteKeys}
              usedBySecretSyncs={usedBySecretSyncsFiltered}
            />
          )
        }
      />
    </>
  );
};
