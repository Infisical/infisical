import { useMemo, useState } from "react";
import { subject } from "@casl/ability";
import {
  ChevronDownIcon,
  ClipboardIcon,
  CopyPlus,
  FolderInputIcon,
  TagsIcon,
  TrashIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SelectedActionBar,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
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
import { fetchDashboardProjectSecretsByKeys } from "@app/hooks/api/dashboard/queries";
import { ProjectSecretsImportedBy, UsedBySecretSyncs } from "@app/hooks/api/dashboard/types";
import { ProjectEnv } from "@app/hooks/api/projects/types";
import { PendingAction } from "@app/hooks/api/secretFolders/types";
import { TSecretRotationV2 } from "@app/hooks/api/secretRotationsV2";
import { useCreateCommit } from "@app/hooks/api/secrets/mutations";
import {
  SecretType,
  SecretV3RawSanitized,
  TDeleteSecretBatchDTO,
  TSecretFolder
} from "@app/hooks/api/types";
import { hasSecretReadValueOrDescribePermission } from "@app/lib/fn/permission";
import type {
  CopySecretsFolder,
  CopySecretsInvocation,
  CopySecretsSource
} from "@app/pages/secret-manager/OverviewPage/components/CopySecretsSheet";
import {
  BulkDeleteDialog,
  BulkTagDialog,
  MoveSecretsModal
} from "@app/pages/secret-manager/OverviewPage/components/SelectionPanel/components";

export enum EntryType {
  FOLDER = "folder",
  SECRET = "secret",
  SECRET_ROTATION = "secretRotation"
}

type Props = {
  secretPath: string;
  resetSelectedEntries: () => void;
  selectedEntries: {
    [EntryType.FOLDER]: Record<string, Record<string, TSecretFolder>>;
    [EntryType.SECRET]: Record<string, Record<string, SecretV3RawSanitized>>;
    [EntryType.SECRET_ROTATION]: Record<string, Record<string, TSecretRotationV2>>;
  };
  importedBy?: ProjectSecretsImportedBy[] | null;
  usedBySecretSyncs?: UsedBySecretSyncs[];
  secretsToDeleteKeys: string[];
  visibleEnvs: ProjectEnv[];
  isImportedSecretPresentInEnv: (environmentSlug: string, secretKey: string) => boolean;
  onCopySecrets: (invocation: CopySecretsInvocation) => void;
};

export const SelectionPanel = ({
  secretPath,
  resetSelectedEntries,
  selectedEntries,
  importedBy,
  secretsToDeleteKeys,
  usedBySecretSyncs = [],
  visibleEnvs,
  isImportedSecretPresentInEnv,
  onCopySecrets
}: Props) => {
  const { permission } = useProjectPermission();
  const [isCopying, setIsCopying] = useState(false);
  const { subscription } = useSubscription();

  const { handlePopUpOpen, handlePopUpToggle, handlePopUpClose, popUp } = usePopUp([
    "bulkDeleteEntries",
    "bulkMoveSecrets",
    "bulkTagSecrets"
  ] as const);

  const selectedFolderCount = Object.keys(selectedEntries.folder).length;
  const selectedKeysCount = Object.keys(selectedEntries.secret).length;
  const selectedRotationCount = Object.keys(selectedEntries.secretRotation).length;
  const isManagedSecretSelected = Object.values(selectedEntries.secret).some((record) =>
    Object.values(record).some((secret) => secret.isRotatedSecret || secret.isHoneyTokenSecret)
  );
  const isHoneyTokenSelected = Object.values(selectedEntries.secret).some((record) =>
    Object.values(record).some((secret) => secret.isHoneyTokenSecret)
  );

  const selectedCount = selectedFolderCount + selectedKeysCount + selectedRotationCount;

  const { currentProject, projectId } = useProject();
  const userAvailableEnvs = currentProject?.environments || [];
  const { mutateAsync: deleteBatchSecretV3 } = useDeleteSecretBatch();
  const { mutateAsync: createCommit } = useCreateCommit();

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
      return "Bulk Delete Secrets and Folders";
    }
    if (selectedKeysCount > 0) {
      return "Bulk Delete Secrets";
    }
    return "Bulk Delete Folders";
  };

  const getDeleteModalDescription = () => {
    if (selectedFolderCount > 0 && selectedKeysCount > 0) {
      return `Delete ${selectedKeysCount} selected secret${selectedKeysCount === 1 ? "" : "s"} and ${selectedFolderCount} selected folder${selectedFolderCount === 1 ? "" : "s"} across all environments.`;
    }
    if (selectedKeysCount > 0) {
      return `Delete ${selectedKeysCount} selected secret${selectedKeysCount === 1 ? "" : "s"} across all environments.`;
    }
    return `Delete ${selectedFolderCount} selected folder${selectedFolderCount === 1 ? "" : "s"} across all environments.`;
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

          if (entry && canDeleteSecret && !entry.isRotatedSecret && !entry.isHoneyTokenSecret) {
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
  const areRotationsSelected = selectedRotationCount > 0;

  // folders are moved one at a time from the inline row action, so bulk move only handles
  // secrets and rotations
  const hasMovableSelection = selectedKeysCount > 0 || selectedRotationCount > 0;
  const shouldShowMove = shouldShowDelete && hasMovableSelection;

  const isMoveDisabled = isHoneyTokenSelected || areFoldersSelected;
  let moveDisabledReason = "";
  if (isHoneyTokenSelected) {
    moveDisabledReason = "Moving honey tokens is not supported";
  } else if (areFoldersSelected) {
    moveDisabledReason = "Folders cannot be moved via multi-select";
  }

  const isDeleteDisabled = areRotationsSelected || isManagedSecretSelected;
  let deleteDisabledReason = "Rotated or honey token secrets cannot be deleted via multi-select";
  if (areRotationsSelected) {
    deleteDisabledReason =
      "Rotations cannot be deleted from this view. Use the delete action on the rotation row instead.";
  }

  const selectedSecretEntries = Object.values(selectedEntries[EntryType.SECRET]).flatMap((perEnv) =>
    Object.entries(perEnv)
  );
  const hasImportedSecretSelection = Object.entries(selectedEntries[EntryType.SECRET]).some(
    ([secretKey, perEnv]) =>
      Object.keys(perEnv).some((environmentSlug) =>
        isImportedSecretPresentInEnv(environmentSlug, secretKey)
      )
  );
  const hasUnmaterializedSecretSelection = Object.values(selectedEntries[EntryType.SECRET]).some(
    (perEnv) => Object.keys(perEnv).length === 0
  );
  const isCopyDisabled =
    hasImportedSecretSelection ||
    hasUnmaterializedSecretSelection ||
    isHoneyTokenSelected ||
    areRotationsSelected ||
    isManagedSecretSelected;

  let copyDisabledReason = "";
  if (hasImportedSecretSelection) {
    copyDisabledReason =
      "Imported secrets must be materialized as shared secrets before they can be copied";
  } else if (hasUnmaterializedSecretSelection) {
    copyDisabledReason = "Unavailable secrets cannot be copied. Select materialized secrets only";
  } else if (isHoneyTokenSelected) {
    copyDisabledReason = "Honey token secrets cannot be copied";
  } else if (areRotationsSelected || isManagedSecretSelected) {
    copyDisabledReason = "Rotated secrets cannot be copied";
  }

  const copySecretsByEnvironment = selectedSecretEntries.reduce<
    Record<string, CopySecretsSource[]>
  >((secretsByEnvironment, [environmentSlug, secret]) => {
    return {
      ...secretsByEnvironment,
      [environmentSlug]: [
        ...(secretsByEnvironment[environmentSlug] ?? []),
        {
          id: secret.id,
          name: secret.key,
          path: secret.path ?? secretPath,
          isValueHidden: secret.secretValueHidden,
          isRotated: secret.isRotatedSecret,
          isHoneyToken: secret.isHoneyTokenSecret
        }
      ]
    };
  }, {});
  const copyFoldersByEnvironment = Object.values(selectedEntries[EntryType.FOLDER])
    .flatMap(Object.entries)
    .reduce<Record<string, CopySecretsFolder[]>>((byEnvironment, [environment, folder]) => {
      const path = `${secretPath === "/" ? "" : secretPath}/${folder.name}`;
      return { ...byEnvironment, [environment]: [...(byEnvironment[environment] ?? []), { path }] };
    }, {});
  const shouldShowBulkCopy = selectedKeysCount > 0 || selectedFolderCount > 0;
  const isClipboardDisabled =
    selectedSecretEntries.length === 0 ||
    hasUnmaterializedSecretSelection ||
    areFoldersSelected ||
    areRotationsSelected ||
    selectedSecretEntries.some(
      ([environment, secret]) =>
        !secret.idOverride &&
        (secret.secretValueHidden ||
          !hasSecretReadValueOrDescribePermission(
            permission,
            ProjectPermissionSecretActions.ReadValue,
            {
              environment,
              secretPath: secret.path ?? secretPath,
              secretName: secret.key,
              secretTags: (secret.tags ?? []).map((tag) => tag.slug)
            }
          ))
    );

  const handleCopyToClipboard = async () => {
    if (isClipboardDisabled || isCopying) return;
    if (
      selectedSecretEntries.some(
        ([, secret]) => !/^[A-Za-z_]/.test(secret.key) || /[^A-Za-z0-9_]/.test(secret.key)
      )
    ) {
      createNotification({
        type: "error",
        title: "Cannot copy secrets as .env",
        text: "Some selected secret names aren’t compatible with .env format. Names must contain only letters, numbers, and underscores, and cannot start with a number. Nothing was copied."
      });
      return;
    }
    setIsCopying(true);
    try {
      const groups = selectedSecretEntries.reduce<
        Record<string, { environment: string; path: string; secrets: SecretV3RawSanitized[] }>
      >((acc, [environment, secret]) => {
        const path = secret.path ?? secretPath;
        const groupKey = JSON.stringify([environment, path]);
        acc[groupKey] ??= { environment, path, secrets: [] };
        acc[groupKey].secrets.push(secret);
        return acc;
      }, {});
      const lines = await Promise.all(
        Object.values(groups).map(async ({ environment, path, secrets }) => {
          const { secrets: fetchedSecrets } = await fetchDashboardProjectSecretsByKeys({
            projectId,
            environment,
            secretPath: path,
            keys: secrets.map((secret) => secret.key),
            viewSecretValue: true
          });
          const valuesById = new Map(fetchedSecrets.map((secret) => [secret.id, secret]));
          const copiedLines = secrets.map((secret) => {
            const fetchedSecret = valuesById.get(secret.idOverride ?? secret.id);
            if (
              !fetchedSecret ||
              fetchedSecret.secretValueHidden ||
              fetchedSecret.secretValue === undefined
            ) {
              throw new Error("Secret value unavailable");
            }
            const escapedValue = fetchedSecret.secretValue
              .replace(/\\/g, "\\\\")
              .replace(/"/g, '\\"')
              .replace(/\r/g, "\\r")
              .replace(/\n/g, "\\n");
            return `${secret.key}="${escapedValue}"`;
          });
          if (visibleEnvs.length > 1) copiedLines.unshift(`# ${environment}`);
          return copiedLines.join("\n");
        })
      );
      await navigator.clipboard.writeText(lines.join("\n"));
      createNotification({ type: "success", text: "Selected secrets copied to clipboard" });
    } catch {
      createNotification({ type: "error", text: "Failed to copy selected secrets to clipboard" });
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <>
      <SelectedActionBar
        selectedCount={selectedCount}
        onClearSelection={resetSelectedEntries}
        iconOnlyClear
      >
        {selectedKeysCount > 0 && (
          <Tooltip open={isTagActionDisabled ? undefined : false}>
            <TooltipTrigger>
              <Button
                isDisabled={isTagActionDisabled}
                variant="project"
                onClick={() => handlePopUpOpen("bulkTagSecrets")}
                size="xs"
              >
                <TagsIcon />
                Add Tags
              </Button>
            </TooltipTrigger>
            <TooltipContent>Access denied</TooltipContent>
          </Tooltip>
        )}
        {shouldShowMove && (
          <Tooltip open={isMoveDisabled ? undefined : false}>
            <TooltipTrigger>
              <Button
                isDisabled={isMoveDisabled}
                variant="project"
                onClick={() => handlePopUpOpen("bulkMoveSecrets")}
                size="xs"
              >
                <FolderInputIcon />
                Move
              </Button>
            </TooltipTrigger>
            <TooltipContent>{moveDisabledReason}</TooltipContent>
          </Tooltip>
        )}
        {shouldShowBulkCopy && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="project" size="xs" isPending={isCopying} isDisabled={isCopying}>
                <CopyPlus />
                Copy
                <ChevronDownIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top">
              <Tooltip open={isCopyDisabled ? undefined : false}>
                <TooltipTrigger asChild>
                  <span>
                    <DropdownMenuItem
                      isDisabled={isCopyDisabled}
                      onSelect={() => {
                        if (isCopyDisabled) return;
                        onCopySecrets({
                          origin: "bulk",
                          sourcePath: secretPath,
                          selectedSecretCount: selectedKeysCount,
                          secretsByEnvironment: copySecretsByEnvironment,
                          sourceEnvironmentSlug:
                            visibleEnvs.length === 1 ? visibleEnvs[0].slug : undefined,
                          folderNames: Object.keys(selectedEntries[EntryType.FOLDER]),
                          foldersByEnvironment: copyFoldersByEnvironment
                        });
                      }}
                    >
                      <CopyPlus />
                      Copy to New Source
                    </DropdownMenuItem>
                  </span>
                </TooltipTrigger>
                <TooltipContent>{copyDisabledReason}</TooltipContent>
              </Tooltip>
              <DropdownMenuItem isDisabled={isClipboardDisabled} onSelect={handleCopyToClipboard}>
                <ClipboardIcon />
                Copy to Clipboard
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {shouldShowDelete && (
          <Tooltip open={isDeleteDisabled ? undefined : false}>
            <TooltipTrigger>
              <Button
                isDisabled={isDeleteDisabled}
                variant="danger"
                onClick={() => handlePopUpOpen("bulkDeleteEntries")}
                size="xs"
              >
                <TrashIcon />
                Delete
              </Button>
            </TooltipTrigger>
            <TooltipContent>{deleteDisabledReason}</TooltipContent>
          </Tooltip>
        )}
      </SelectedActionBar>
      <MoveSecretsModal
        isOpen={popUp.bulkMoveSecrets.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("bulkMoveSecrets", isOpen)}
        environments={userAvailableEnvs}
        visibleEnvs={visibleEnvs}
        projectId={projectId}
        projectSlug={currentProject.slug}
        sourceSecretPath={secretPath}
        secrets={selectedEntries[EntryType.SECRET]}
        rotations={selectedEntries[EntryType.SECRET_ROTATION]}
        folders={{}}
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
        description={getDeleteModalDescription()}
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
