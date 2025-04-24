import { useMemo } from "react";
import { subject } from "@casl/ability";
import { faAnglesRight, faMinusSquare, faTrash } from "@fortawesome/free-solid-svg-icons";
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
import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { usePopUp } from "@app/hooks";
import { useDeleteFolder, useDeleteSecretBatch } from "@app/hooks/api";
import { ProjectSecretsImportedBy } from "@app/hooks/api/dashboard/types";
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
  importedByEnvs?: { environment: string; importedBy: ProjectSecretsImportedBy[] }[];
};

export const SelectionPanel = ({
  secretPath,
  resetSelectedEntries,
  selectedEntries,
  importedByEnvs
}: Props) => {
  const { permission } = useProjectPermission();

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

  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id || "";
  const userAvailableEnvs = currentWorkspace?.environments || [];
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

  const secretsToDeleteKeys = useMemo(() => {
    return Object.values(selectedEntries.secret).flatMap((entries) =>
      Object.values(entries).map((secret) => secret.key)
    );
  }, [selectedEntries]);

  const filterAndMergeEnvironments = (
    envNames: string[],
    envs: { environment: string; importedBy: ProjectSecretsImportedBy[] }[]
  ): ProjectSecretsImportedBy[] => {
    const filteredEnvs = envs.filter((env) => envNames.includes(env.environment));

    if (filteredEnvs.length === 0) return [];

    const allImportedBy = filteredEnvs.flatMap((env) => env.importedBy);
    const groupedBySlug: Record<string, ProjectSecretsImportedBy[]> = {};

    allImportedBy.forEach((item) => {
      const { slug } = item.environment;
      if (!groupedBySlug[slug]) groupedBySlug[slug] = [];
      groupedBySlug[slug].push(item);
    });

    const mergedImportedBy = Object.values(groupedBySlug).map((group) => {
      const { environment } = group[0];
      const allFolders = group.flatMap((item) => item.folders);

      const foldersByName: Record<string, (typeof allFolders)[number][]> = {};
      allFolders.forEach((folder) => {
        if (!foldersByName[folder.name]) foldersByName[folder.name] = [];
        foldersByName[folder.name].push(folder);
      });

      const mergedFolders = Object.entries(foldersByName).map(([name, folders]) => {
        const isImported = folders.some((folder) => folder.isImported);
        const allSecrets = folders.flatMap((folder) => folder.secrets || []);

        const uniqueSecrets: { secretId: string; referencedSecretKey: string }[] = [];
        const secretIds = new Set<string>();

        allSecrets
          .filter((secret) => secretsToDeleteKeys.includes(secret.referencedSecretKey))
          .forEach((secret) => {
            if (!secretIds.has(secret.secretId)) {
              secretIds.add(secret.secretId);
              uniqueSecrets.push(secret);
            }
          });

        return {
          name,
          isImported,
          ...(uniqueSecrets.length > 0 ? { secrets: uniqueSecrets } : {})
        };
      });

      return {
        environment,
        folders: mergedFolders.filter(
          (folder) => folder.isImported || (folder.secrets && folder.secrets.length > 0)
        )
      };
    });

    return mergedImportedBy;
  };

  const importedBy = useMemo(() => {
    if (selectedKeysCount === 0 || !importedByEnvs) return null;
    return filterAndMergeEnvironments(
      Object.values(selectedEntries.secret).flatMap((entries) => Object.keys(entries)),
      importedByEnvs
    );
  }, [importedByEnvs, selectedEntries, selectedKeysCount]);

  const getDeleteModalTitle = () => {
    if (selectedFolderCount > 0 && selectedKeysCount > 0) {
      return "Do you want to delete the selected secrets and folders across environments?";
    }
    if (selectedKeysCount > 0) {
      return "Do you want to delete the selected secrets across environments?";
    }
    return "Do you want to delete the selected folders across environments?";
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
                projectId: workspaceId
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

  const areFoldersSelected = Boolean(Object.keys(selectedEntries[EntryType.FOLDER]).length);

  return (
    <>
      <div
        className={twMerge(
          "h-0 flex-shrink-0 overflow-hidden transition-all",
          isMultiSelectActive && "h-16"
        )}
      >
        <div className="mt-3.5 flex items-center rounded-md border border-mineshaft-600 bg-mineshaft-800 px-4 py-2 text-bunker-300">
          <Tooltip content="Clear">
            <IconButton variant="plain" ariaLabel="clear-selection" onClick={resetSelectedEntries}>
              <FontAwesomeIcon icon={faMinusSquare} size="lg" />
            </IconButton>
          </Tooltip>
          <div className="ml-1 flex-grow px-2 text-sm">{selectedCount} Selected</div>
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
        projectId={workspaceId}
        projectSlug={currentWorkspace.slug}
        sourceSecretPath={secretPath}
        secrets={selectedEntries[EntryType.SECRET]}
        onComplete={resetSelectedEntries}
      />
      <DeleteActionModal
        isOpen={popUp.bulkDeleteEntries.isOpen}
        deleteKey="delete"
        title={getDeleteModalTitle()}
        onChange={(isOpen) => handlePopUpToggle("bulkDeleteEntries", isOpen)}
        onDeleteApproved={handleBulkDelete}
        formContent={
          importedBy &&
          importedBy.some((element) => element.folders.length > 0) && (
            <CollapsibleSecretImports
              importedBy={importedBy}
              secretsToDelete={secretsToDeleteKeys}
            />
          )
        }
      />
    </>
  );
};
