import { useMemo, useState } from "react";
import { subject } from "@casl/ability";
import { FolderIcon, FolderInputIcon, KeyIcon, TrashIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldLabel,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableInput,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
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
import { MoveSecretsModal } from "@app/pages/secret-manager/OverviewPage/components/SelectionPanel/components";
import { CollapsibleSecretImports } from "@app/pages/secret-manager/SecretDashboardPage/components/SecretListView/CollapsibleSecretImports";

export enum EntryType {
  FOLDER = "folder",
  SECRET = "secret"
}

type BulkDeleteDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  subTitle?: string;
  onDeleteApproved: () => Promise<void>;
  selectedEntries: {
    [EntryType.FOLDER]: Record<string, Record<string, TSecretFolder>>;
    [EntryType.SECRET]: Record<string, Record<string, SecretV3RawSanitized>>;
  };
  visibleEnvs: ProjectEnv[];
  importedBy?: ProjectSecretsImportedBy[] | null;
  secretsToDeleteKeys: string[];
  usedBySecretSyncsFiltered: UsedBySecretSyncs[] | null;
};

const BulkDeleteDialog = ({
  isOpen,
  onOpenChange,
  title,
  subTitle,
  onDeleteApproved,
  selectedEntries,
  visibleEnvs,
  importedBy,
  secretsToDeleteKeys,
  usedBySecretSyncsFiltered
}: BulkDeleteDialogProps) => {
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const hasAffectedResources =
    (usedBySecretSyncsFiltered && usedBySecretSyncsFiltered.length > 0) ||
    (importedBy &&
      importedBy.some((element) =>
        element.folders.some(
          (folder) =>
            folder.isImported ||
            (folder.secrets?.some((secret) =>
              secretsToDeleteKeys.includes(secret.referencedSecretKey)
            ) ??
              false)
        )
      ));

  const selectedResources = useMemo(() => {
    const items: { type: "folder" | "secret"; name: string; envSlugs: Set<string> }[] = [];

    Object.entries(selectedEntries.folder).forEach(([name, envRecord]) => {
      items.push({
        type: "folder",
        name,
        envSlugs: new Set(Object.keys(envRecord))
      });
    });

    Object.entries(selectedEntries.secret).forEach(([name, envRecord]) => {
      items.push({
        type: "secret",
        name,
        envSlugs: new Set(Object.keys(envRecord))
      });
    });

    return items;
  }, [selectedEntries]);

  const onConfirmDelete = async () => {
    if (confirmText !== "delete") return;
    setIsDeleting(true);
    try {
      await onDeleteApproved();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setConfirmText("");
        onOpenChange(open);
      }}
    >
      <DialogContent className="max-w-7xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {subTitle && <DialogDescription>{subTitle}</DialogDescription>}
        </DialogHeader>

        {selectedResources.length > 0 && (
          <UnstableTable
            containerClassName={twMerge(
              "overflow-auto",
              hasAffectedResources ? "max-h-[30vh]" : "max-h-[60vh]"
            )}
          >
            <UnstableTableHeader className="sticky -top-px z-20 bg-container [&_tr]:border-b-0">
              <UnstableTableRow>
                <UnstableTableHead className="sticky left-0 z-20 w-10 max-w-10 min-w-10 border-b-0 bg-container shadow-[inset_0_-1px_0_var(--color-border)]">
                  Type
                </UnstableTableHead>
                <UnstableTableHead className="sticky left-10 z-20 max-w-[30vw] min-w-[30vw] border-b-0 bg-container shadow-[inset_-1px_0_0_var(--color-border),inset_0_-1px_0_var(--color-border)]">
                  Name
                </UnstableTableHead>
                {visibleEnvs.map((env) => (
                  <UnstableTableHead
                    key={env.slug}
                    className="w-32 max-w-32 border-r border-b-0 text-center shadow-[inset_0_-1px_0_var(--color-border)] last:border-r-0"
                    isTruncatable
                  >
                    {env.name}
                  </UnstableTableHead>
                ))}
              </UnstableTableRow>
            </UnstableTableHeader>
            <UnstableTableBody>
              {selectedResources.map((item) => (
                <UnstableTableRow key={`${item.type}-${item.name}`} className="group">
                  <UnstableTableCell className="sticky left-0 z-10 bg-container transition-colors duration-75 group-hover:bg-container-hover">
                    {item.type === "folder" ? (
                      <FolderIcon className="size-4 text-folder" />
                    ) : (
                      <KeyIcon className="size-4 text-secret" />
                    )}
                  </UnstableTableCell>
                  <UnstableTableCell
                    className="sticky left-10 z-10 max-w-80 bg-container shadow-[inset_-1px_0_0_var(--color-border)] transition-colors duration-75 group-hover:bg-container-hover"
                    isTruncatable
                  >
                    {item.name}
                  </UnstableTableCell>
                  {visibleEnvs.map((env) => (
                    <UnstableTableCell
                      key={env.slug}
                      className="border-r text-center last:border-r-0"
                    >
                      {item.envSlugs.has(env.slug) ? (
                        <TrashIcon className="inline-block size-4 text-danger" />
                      ) : (
                        <span className="text-muted">&mdash;</span>
                      )}
                    </UnstableTableCell>
                  ))}
                </UnstableTableRow>
              ))}
            </UnstableTableBody>
          </UnstableTable>
        )}

        {hasAffectedResources && (
          <CollapsibleSecretImports
            importedBy={importedBy || []}
            secretsToDelete={secretsToDeleteKeys}
            usedBySecretSyncs={usedBySecretSyncsFiltered}
          />
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onConfirmDelete();
          }}
        >
          <Field>
            <FieldLabel>
              Type <span className="font-bold">delete</span> to perform this action
            </FieldLabel>
            <FieldContent>
              <UnstableInput
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Type delete here"
                autoComplete="off"
              />
            </FieldContent>
          </Field>
        </form>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button
            variant="danger"
            isDisabled={confirmText !== "delete" || isDeleting}
            isPending={isDeleting}
            onClick={onConfirmDelete}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

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
              Rotated Secrets will not be affected by action.
            </span>
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
