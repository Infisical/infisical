import { subject } from "@casl/ability";
import { faMinusSquare, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { Button, DeleteActionModal, IconButton, Tooltip } from "@app/components/v2";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProjectPermission,
  useWorkspace
} from "@app/context";
import { usePopUp } from "@app/hooks";
import { useDeleteFolder, useDeleteSecretBatch } from "@app/hooks/api";
import {
  DecryptedSecret,
  SecretType,
  TDeleteSecretBatchDTO,
  TSecretFolder
} from "@app/hooks/api/types";

export enum EntryType {
  FOLDER = "folder",
  SECRET = "secret"
}

type Props = {
  secretPath: string;
  getSecretByKey: (slug: string, key: string) => DecryptedSecret | undefined;
  getFolderByNameAndEnv: (name: string, env: string) => TSecretFolder | undefined;
  resetSelectedEntries: () => void;
  selectedEntries: {
    [EntryType.FOLDER]: Record<string, boolean>;
    [EntryType.SECRET]: Record<string, boolean>;
  };
};

export const SelectionPanel = ({
  getFolderByNameAndEnv,
  getSecretByKey,
  secretPath,
  resetSelectedEntries,
  selectedEntries
}: Props) => {
  const { permission } = useProjectPermission();

  const { handlePopUpOpen, handlePopUpToggle, handlePopUpClose, popUp } = usePopUp([
    "bulkDeleteEntries"
  ] as const);

  const selectedFolderCount = Object.keys(selectedEntries.folder).length
  const selectedKeysCount = Object.keys(selectedEntries.secret).length
  const selectedCount = selectedFolderCount + selectedKeysCount

  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || "";
  const userAvailableEnvs = currentWorkspace?.environments || [];
  const { mutateAsync: deleteBatchSecretV3 } = useDeleteSecretBatch();
  const { mutateAsync: deleteFolder } = useDeleteFolder();

  const isMultiSelectActive = selectedCount > 0;

  // user should have the ability to delete secrets/folders in at least one of the envs
  const shouldShowDelete = userAvailableEnvs.some((env) =>
    permission.can(
      ProjectPermissionActions.Delete,
      subject(ProjectPermissionSub.Secrets, { environment: env.slug, secretPath })
    )
  );

  const getDeleteModalTitle = () => {
    if (selectedFolderCount > 0 && selectedKeysCount > 0) {
      return "Do you want to delete the selected secrets and folders across environments?";
    } else if (selectedKeysCount > 0 && selectedFolderCount === 0) {
      return "Do you want to delete the selected secrets across environments?";
    } else {
      return "Do you want to delete the selected folders across environments?";
    }
  }

  const handleBulkDelete = async () => {
    let processedEntries = 0;

    const promises = userAvailableEnvs.map(async (env) => {
      // additional check: ensure that bulk delete is only executed on envs that user has access to
      if (
        permission.cannot(
          ProjectPermissionActions.Delete,
          subject(ProjectPermissionSub.Secrets, { environment: env.slug, secretPath })
        )
      ) {
        return;
      }

      await Promise.all(
        Object.keys(selectedEntries.folder).map(async (folderName) => {
          const folder = getFolderByNameAndEnv(folderName, env.slug);
          if (folder) {
            processedEntries += 1;
            await deleteFolder({
              folderId: folder?.id,
              path: secretPath,
              environment: env.slug,
              projectId: workspaceId
            });
          }
        })
      );

      const secretsToDelete = Object.keys(selectedEntries.secret).reduce(
        (accum: TDeleteSecretBatchDTO["secrets"], secretName) => {
          const entry = getSecretByKey(env.slug, secretName);
          if (entry) {
            return [
              ...accum,
              {
                secretName: entry.key,
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
          workspaceId,
          environment: env.slug,
          secrets: secretsToDelete
        });
      }
    });

    const results = await Promise.allSettled(promises);
    const areEntriesDeleted = results.some((result) => result.status === "fulfilled");
    if (processedEntries === 0) {
      handlePopUpClose("bulkDeleteEntries");
      createNotification({
        type: "info",
        text: "You don't have access to delete selected items"
      });
    } else if (areEntriesDeleted) {
      handlePopUpClose("bulkDeleteEntries");
      resetSelectedEntries();
      createNotification({
        type: "success",
        text: "Successfully deleted selected secrets and folders"
      });
    } else {
      createNotification({
        type: "error",
        text: "Failed to delete selected secrets and folders"
      });
    }
  };

  return (
    <>
      <div
        className={twMerge(
          "h-0 flex-shrink-0 overflow-hidden transition-all",
          isMultiSelectActive && "h-16"
        )}
      >
        <div className="mt-3.5 flex items-center rounded-md border border-mineshaft-600 bg-mineshaft-800 py-2 px-4 text-bunker-300">
          <Tooltip content="Clear">
            <IconButton variant="plain" ariaLabel="clear-selection" onClick={resetSelectedEntries}>
              <FontAwesomeIcon icon={faMinusSquare} size="lg" />
            </IconButton>
          </Tooltip>
          <div className="ml-4 flex-grow px-2 text-sm">{selectedCount} Selected</div>
          {shouldShowDelete && (
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
          )}
        </div>
      </div>
      <DeleteActionModal
        isOpen={popUp.bulkDeleteEntries.isOpen}
        deleteKey="delete"
        title={getDeleteModalTitle()}
        onChange={(isOpen) => handlePopUpToggle("bulkDeleteEntries", isOpen)}
        onDeleteApproved={handleBulkDelete}
      />
    </>
  );
};
