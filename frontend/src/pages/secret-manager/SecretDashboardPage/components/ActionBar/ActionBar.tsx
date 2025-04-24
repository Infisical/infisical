import { TypeOptions } from "react-toastify";
import { subject } from "@casl/ability";
import {
  faAngleDown,
  faAnglesRight,
  faCheckCircle,
  faChevronRight,
  faCodeCommit,
  faDownload,
  faEye,
  faEyeSlash,
  faFileImport,
  faFilter,
  faFingerprint,
  faFolder,
  faFolderPlus,
  faKey,
  faLock,
  faMinusSquare,
  faPaste,
  faPlus,
  faRotate,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import FileSaver from "file-saver";
import { twMerge } from "tailwind-merge";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { CreateSecretRotationV2Modal } from "@app/components/secret-rotations-v2";
import {
  Button,
  DeleteActionModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownSubMenu,
  DropdownSubMenuContent,
  DropdownSubMenuTrigger,
  IconButton,
  Modal,
  ModalContent,
  Tooltip
} from "@app/components/v2";
import {
  ProjectPermissionActions,
  ProjectPermissionDynamicSecretActions,
  ProjectPermissionSub,
  useSubscription,
  useWorkspace
} from "@app/context";
import { ProjectPermissionSecretRotationActions } from "@app/context/ProjectPermissionContext/types";
import { usePopUp } from "@app/hooks";
import {
  useCreateFolder,
  useCreateSecretBatch,
  useDeleteSecretBatch,
  useMoveSecrets,
  useUpdateSecretBatch
} from "@app/hooks/api";
import {
  dashboardKeys,
  fetchDashboardProjectSecretsByKeys
} from "@app/hooks/api/dashboard/queries";
import { secretApprovalRequestKeys } from "@app/hooks/api/secretApprovalRequest/queries";
import { fetchProjectSecrets, secretKeys } from "@app/hooks/api/secrets/queries";
import { ApiErrorTypes, SecretType, TApiErrors, WsTag } from "@app/hooks/api/types";
import { SecretSearchInput } from "@app/pages/secret-manager/OverviewPage/components/SecretSearchInput";

import {
  PopUpNames,
  usePopUpAction,
  useSelectedSecretActions,
  useSelectedSecrets
} from "../../SecretMainPage.store";
import { Filter, RowType } from "../../SecretMainPage.types";
import { CollapsibleSecretImports } from "../SecretListView/CollapsibleSecretImports";
import { ReplicateFolderFromBoard } from "./ReplicateFolderFromBoard/ReplicateFolderFromBoard";
import { CreateDynamicSecretForm } from "./CreateDynamicSecretForm";
import { CreateSecretImportForm } from "./CreateSecretImportForm";
import { FolderForm } from "./FolderForm";
import { MoveSecretsModal } from "./MoveSecretsModal";

type TParsedEnv = Record<string, { value: string; comments: string[]; secretPath?: string }>;
type TParsedFolderEnv = Record<
  string,
  Record<string, { value: string; comments: string[]; secretPath?: string }>
>;
type TSecOverwriteOpt = { update: TParsedEnv; create: TParsedEnv };

type Props = {
  // switch the secrets type as it gets decrypted after api call
  environment: string;
  // @depreciated will be moving all these details to zustand
  workspaceId: string;
  projectSlug: string;
  secretPath?: string;
  filter: Filter;
  tags?: WsTag[];
  isVisible?: boolean;
  snapshotCount: number;
  isSnapshotCountLoading?: boolean;
  protectedBranchPolicyName?: string;
  onSearchChange: (term: string) => void;
  onToggleTagFilter: (tagId: string) => void;
  onVisibilityToggle: () => void;
  onToggleRowType: (rowType: RowType) => void;
  onClickRollbackMode: () => void;
  importedBy?: {
    environment: { name: string; slug: string };
    folders: {
      name: string;
      secrets?: { secretId: string; referencedSecretKey: string }[];
      isImported: boolean;
    }[];
  }[];
};

export const ActionBar = ({
  environment,
  workspaceId,
  projectSlug,
  secretPath = "/",
  filter,
  tags = [],
  isVisible,
  snapshotCount,
  isSnapshotCountLoading,
  onSearchChange,
  onToggleTagFilter,
  onVisibilityToggle,
  onClickRollbackMode,
  onToggleRowType,
  protectedBranchPolicyName,
  importedBy
}: Props) => {
  const { handlePopUpOpen, handlePopUpToggle, handlePopUpClose, popUp } = usePopUp([
    "addFolder",
    "addDynamicSecret",
    "addSecretImport",
    "bulkDeleteSecrets",
    "addSecretRotation",
    "moveSecrets",
    "misc",
    "upgradePlan",
    "replicateFolder",
    "confirmUpload"
  ] as const);
  const isProtectedBranch = Boolean(protectedBranchPolicyName);
  const { subscription } = useSubscription();
  const { openPopUp } = usePopUpAction();
  const { mutateAsync: createFolder } = useCreateFolder();
  const { mutateAsync: deleteBatchSecretV3 } = useDeleteSecretBatch();
  const { mutateAsync: moveSecrets } = useMoveSecrets();
  const { mutateAsync: updateSecretBatch, isPending: isUpdatingSecrets } = useUpdateSecretBatch({
    options: { onSuccess: undefined }
  });
  const { mutateAsync: createSecretBatch, isPending: isCreatingSecrets } = useCreateSecretBatch({
    options: { onSuccess: undefined }
  });
  const queryClient = useQueryClient();

  const selectedSecrets = useSelectedSecrets();
  const { reset: resetSelectedSecret } = useSelectedSecretActions();
  const isMultiSelectActive = Boolean(Object.keys(selectedSecrets).length);

  const { currentWorkspace } = useWorkspace();

  const handleFolderCreate = async (folderName: string, description: string | null) => {
    try {
      await createFolder({
        name: folderName,
        path: secretPath,
        environment,
        projectId: workspaceId,
        description
      });
      handlePopUpClose("addFolder");
      createNotification({
        type: "success",
        text: "Successfully created folder"
      });
    } catch (error) {
      console.log(error);
      createNotification({
        type: "error",
        text: "Failed to create folder"
      });
    }
  };

  const handleSecretDownload = async () => {
    try {
      const { secrets: localSecrets, imports: localImportedSecrets } = await fetchProjectSecrets({
        workspaceId,
        expandSecretReferences: true,
        includeImports: true,
        environment,
        secretPath
      });
      const secretsPicked = new Set<string>();
      const secretsToDownload: { key: string; value?: string; comment?: string }[] = [];
      localSecrets.forEach((el) => {
        secretsPicked.add(el.secretKey);
        secretsToDownload.push({
          key: el.secretKey,
          value: el.secretValue,
          comment: el.secretComment
        });
      });

      for (let i = localImportedSecrets.length - 1; i >= 0; i -= 1) {
        for (let j = localImportedSecrets[i].secrets.length - 1; j >= 0; j -= 1) {
          const secret = localImportedSecrets[i].secrets[j];
          if (!secretsPicked.has(secret.secretKey)) {
            secretsToDownload.push({
              key: secret.secretKey,
              value: secret.secretValue,
              comment: secret.secretComment
            });
          }
          secretsPicked.add(secret.secretKey);
        }
      }

      const file = secretsToDownload
        .sort((a, b) => a.key.toLowerCase().localeCompare(b.key.toLowerCase()))
        .reduce(
          (prev, { key, comment, value }, index) =>
            prev +
            (comment
              ? `${index === 0 ? "#" : "\n#"} ${comment}\n${key}=${value}\n`
              : `${key}=${value}\n`),
          ""
        );

      const blob = new Blob([file], { type: "text/plain;charset=utf-8" });
      FileSaver.saveAs(blob, `${environment}.env`);
    } catch (err) {
      if (err instanceof AxiosError) {
        const error = err?.response?.data as TApiErrors;

        if (error?.error === ApiErrorTypes.ForbiddenError && error.message.includes("readValue")) {
          createNotification({
            title: "You don't have permission to download secrets",
            text: "You don't have permission to view one or more of the secrets in the current folder. Please contact your administrator.",
            type: "error"
          });
          return;
        }
      }
      createNotification({
        title: "Failed to download secrets",
        text: "Please try again later.",
        type: "error"
      });
    }
  };

  const handleSecretBulkDelete = async () => {
    const bulkDeletedSecrets = Object.values(selectedSecrets);
    try {
      await deleteBatchSecretV3({
        secretPath,
        workspaceId,
        environment,
        secrets: bulkDeletedSecrets.map(({ key }) => ({ secretKey: key, type: SecretType.Shared }))
      });
      resetSelectedSecret();
      handlePopUpClose("bulkDeleteSecrets");
      createNotification({
        type: "success",
        text: "Successfully deleted secrets"
      });
    } catch (error) {
      console.log(error);
      createNotification({
        type: "error",
        text: "Failed to delete secrets"
      });
    }
  };

  const handleSecretsMove = async ({
    destinationEnvironment,
    destinationSecretPath,
    shouldOverwrite
  }: {
    destinationEnvironment: string;
    destinationSecretPath: string;
    shouldOverwrite: boolean;
  }) => {
    try {
      const secretsToMove = Object.values(selectedSecrets);
      const { isDestinationUpdated, isSourceUpdated } = await moveSecrets({
        projectSlug,
        shouldOverwrite,
        sourceEnvironment: environment,
        sourceSecretPath: secretPath,
        destinationEnvironment,
        destinationSecretPath,
        projectId: workspaceId,
        secretIds: secretsToMove.map((sec) => sec.id)
      });

      let notificationMessage = "";
      let notificationType: TypeOptions = "info";

      if (isDestinationUpdated && isSourceUpdated) {
        notificationMessage = "Successfully moved selected secrets";
        notificationType = "success";
      } else if (isDestinationUpdated) {
        notificationMessage =
          "Successfully created secrets in destination. A secret approval request has been generated for the source.";
      } else if (isSourceUpdated) {
        notificationMessage = "A secret approval request has been generated in the destination";
      } else {
        notificationMessage =
          "A secret approval request has been generated in both the source and the destination.";
      }

      createNotification({
        type: notificationType,
        text: notificationMessage
      });

      resetSelectedSecret();
    } catch (error) {
      console.error(error);
    }
  };

  // Replicate Folder Logic
  const createSecretCount = Object.keys(
    (popUp.confirmUpload?.data as TSecOverwriteOpt)?.create || {}
  ).length;

  const updateSecretCount = Object.keys(
    (popUp.confirmUpload?.data as TSecOverwriteOpt)?.update || {}
  ).length;

  const isNonConflictingUpload = !updateSecretCount;
  const isSubmitting = isCreatingSecrets || isUpdatingSecrets;

  const handleParsedEnvMultiFolder = async (envByPath: TParsedFolderEnv) => {
    if (Object.keys(envByPath).length === 0) {
      createNotification({
        type: "error",
        text: "Failed to find secrets"
      });
      return;
    }

    try {
      const allUpdateSecrets: TParsedEnv = {};
      const allCreateSecrets: TParsedEnv = {};

      await Promise.all(
        Object.entries(envByPath).map(async ([folderPath, secrets]) => {
          // Normalize the path
          let normalizedPath = folderPath;

          // If the path is "/", use the current secretPath
          if (normalizedPath === "/") {
            normalizedPath = secretPath;
          } else {
            // Otherwise, concatenate with the current secretPath, avoiding double slashes
            const baseSecretPath = secretPath.endsWith("/") ? secretPath.slice(0, -1) : secretPath;
            // Remove leading slash from folder path if present to avoid double slashes
            const cleanFolderPath = folderPath.startsWith("/")
              ? folderPath.substring(1)
              : folderPath;
            normalizedPath = `${baseSecretPath}/${cleanFolderPath}`;
          }

          const secretFolderKeys = Object.keys(secrets);

          if (secretFolderKeys.length === 0) return;

          // Check which secrets already exist in this path
          const batchSize = 50;
          const secretBatches = Array.from(
            { length: Math.ceil(secretFolderKeys.length / batchSize) },
            (_, i) => secretFolderKeys.slice(i * batchSize, (i + 1) * batchSize)
          );

          const existingSecretLookup: Record<string, boolean> = {};

          const processBatches = async () => {
            await secretBatches.reduce(async (previous, batch) => {
              await previous;

              const { secrets: batchSecrets } = await fetchDashboardProjectSecretsByKeys({
                secretPath: normalizedPath,
                environment,
                projectId: workspaceId,
                keys: batch
              });

              batchSecrets.forEach((secret) => {
                existingSecretLookup[secret.secretKey] = true;
              });
            }, Promise.resolve());
          };

          await processBatches();

          // Categorize each secret as update or create
          secretFolderKeys.forEach((secretKey) => {
            const secretData = secrets[secretKey];

            // Store the path with the secret for later batch processing
            const secretWithPath = {
              ...secretData,
              secretPath: normalizedPath
            };

            if (existingSecretLookup[secretKey]) {
              allUpdateSecrets[secretKey] = secretWithPath;
            } else {
              allCreateSecrets[secretKey] = secretWithPath;
            }
          });
        })
      );

      handlePopUpOpen("confirmUpload", {
        update: allUpdateSecrets,
        create: allCreateSecrets
      });
    } catch (e) {
      console.error(e);
      createNotification({
        text: "Failed to check for secret conflicts",
        type: "error"
      });
      handlePopUpClose("confirmUpload");
    }
  };

  const handleSaveFolderImport = async () => {
    const { update, create } = popUp?.confirmUpload?.data as TSecOverwriteOpt;
    try {
      // Group secrets by their path for batch operations
      const groupedCreateSecrets: Record<
        string,
        Array<{
          type: SecretType;
          secretComment: string;
          secretValue: string;
          secretKey: string;
        }>
      > = {};

      const groupedUpdateSecrets: Record<
        string,
        Array<{
          type: SecretType;
          secretComment: string;
          secretValue: string;
          secretKey: string;
        }>
      > = {};

      // Collect all unique paths that need folders to be created
      const allPaths = new Set<string>();

      // Add paths from create secrets
      Object.values(create || {}).forEach((secData) => {
        if (secData.secretPath && secData.secretPath !== secretPath) {
          allPaths.add(secData.secretPath);
        }
      });

      // Create a map of folder paths to their folder name (last segment)
      const folderPaths = Array.from(allPaths).map((path) => {
        // Remove trailing slash if it exists
        const normalizedPath = path.endsWith("/") ? path.slice(0, -1) : path;
        // Split by '/' to get path segments
        const segments = normalizedPath.split("/");
        // Get the last segment as the folder name
        const folderName = segments[segments.length - 1];
        // Get the parent path (everything except the last segment)
        const parentPath = segments.slice(0, -1).join("/");

        return {
          folderName,
          fullPath: normalizedPath,
          parentPath: parentPath || "/"
        };
      });

      // Sort paths by depth (shortest first) to ensure parent folders are created before children
      folderPaths.sort(
        (a, b) => (a.fullPath.match(/\//g) || []).length - (b.fullPath.match(/\//g) || []).length
      );

      // Track created folders to avoid duplicates
      const createdFolders = new Set<string>();

      // Create all necessary folders in order using Promise.all and reduce
      await folderPaths.reduce(async (previousPromise, { folderName, fullPath, parentPath }) => {
        // Wait for the previous promise to complete
        await previousPromise;

        // Skip if we've already created this folder
        if (createdFolders.has(fullPath)) return Promise.resolve();

        try {
          await createFolder({
            name: folderName,
            path: parentPath,
            environment,
            projectId: workspaceId
          });

          createdFolders.add(fullPath);
        } catch (err) {
          console.log(`Folder ${folderName} may already exist:`, err);
        }

        return Promise.resolve();
      }, Promise.resolve());

      if (Object.keys(create || {}).length > 0) {
        Object.entries(create).forEach(([secretKey, secData]) => {
          // Use the stored secretPath or fall back to the current secretPath
          const path = secData.secretPath || secretPath;

          if (!groupedCreateSecrets[path]) {
            groupedCreateSecrets[path] = [];
          }

          groupedCreateSecrets[path].push({
            type: SecretType.Shared,
            secretComment: secData.comments.join("\n"),
            secretValue: secData.value,
            secretKey
          });
        });

        await Promise.all(
          Object.entries(groupedCreateSecrets).map(([path, secrets]) =>
            createSecretBatch({
              secretPath: path,
              workspaceId,
              environment,
              secrets
            })
          )
        );
      }

      if (Object.keys(update || {}).length > 0) {
        Object.entries(update).forEach(([secretKey, secData]) => {
          // Use the stored secretPath or fall back to the current secretPath
          const path = secData.secretPath || secretPath;

          if (!groupedUpdateSecrets[path]) {
            groupedUpdateSecrets[path] = [];
          }

          groupedUpdateSecrets[path].push({
            type: SecretType.Shared,
            secretComment: secData.comments.join("\n"),
            secretValue: secData.value,
            secretKey
          });
        });

        // Update secrets for each path in parallel
        await Promise.all(
          Object.entries(groupedUpdateSecrets).map(([path, secrets]) =>
            updateSecretBatch({
              secretPath: path,
              workspaceId,
              environment,
              secrets
            })
          )
        );
      }

      // Invalidate appropriate queries to refresh UI
      queryClient.invalidateQueries({
        queryKey: secretKeys.getProjectSecret({ workspaceId, environment, secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: dashboardKeys.getDashboardSecrets({ projectId: workspaceId, secretPath })
      });
      queryClient.invalidateQueries({
        queryKey: secretApprovalRequestKeys.count({ workspaceId })
      });

      // Close the modal and show notification
      handlePopUpClose("confirmUpload");
      createNotification({
        type: "success",
        text: isProtectedBranch
          ? "Uploaded changes have been sent for review"
          : "Successfully uploaded secrets"
      });
    } catch (err) {
      console.log(err);
      createNotification({
        type: "error",
        text: "Failed to upload secrets"
      });
    }
  };

  return (
    <>
      <div className="mt-4 flex items-center space-x-2">
        <SecretSearchInput
          isSingleEnv
          className="w-2/5"
          value={filter.searchFilter}
          onChange={onSearchChange}
          environments={[currentWorkspace.environments.find((env) => env.slug === environment)!]}
          projectId={workspaceId}
          tags={tags}
        />
        <div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton
                variant="outline_bg"
                ariaLabel="Download"
                className={twMerge(
                  "transition-all",
                  (Object.keys(filter.tags).length ||
                    Object.values(filter.include).filter((include) => !include).length) &&
                    "border-primary/50 text-primary"
                )}
              >
                <FontAwesomeIcon icon={faFilter} />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="p-0">
              <DropdownMenuGroup>Filter By</DropdownMenuGroup>
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  onToggleRowType(RowType.Import);
                }}
                icon={filter?.include[RowType.Import] && <FontAwesomeIcon icon={faCheckCircle} />}
                iconPos="right"
              >
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon icon={faFileImport} className="text-green-700" />
                  <span>Imports</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  onToggleRowType(RowType.Folder);
                }}
                icon={filter?.include[RowType.Folder] && <FontAwesomeIcon icon={faCheckCircle} />}
                iconPos="right"
              >
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon icon={faFolder} className="text-yellow-700" />
                  <span>Folders</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  onToggleRowType(RowType.DynamicSecret);
                }}
                icon={
                  filter?.include[RowType.DynamicSecret] && <FontAwesomeIcon icon={faCheckCircle} />
                }
                iconPos="right"
              >
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon icon={faFingerprint} className="text-yellow-700" />
                  <span>Dynamic Secrets</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  onToggleRowType(RowType.SecretRotation);
                }}
                icon={
                  filter?.include[RowType.SecretRotation] && (
                    <FontAwesomeIcon icon={faCheckCircle} />
                  )
                }
                iconPos="right"
              >
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon icon={faRotate} className="text-mineshaft-400" />
                  <span>Secret Rotations</span>
                </div>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.preventDefault();
                  onToggleRowType(RowType.Secret);
                }}
                icon={filter?.include[RowType.Secret] && <FontAwesomeIcon icon={faCheckCircle} />}
                iconPos="right"
              >
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon icon={faKey} className="text-bunker-300" />
                  <span>Secrets</span>
                </div>
              </DropdownMenuItem>
              <DropdownSubMenu>
                <DropdownSubMenuTrigger
                  iconPos="right"
                  icon={<FontAwesomeIcon icon={faChevronRight} size="sm" />}
                >
                  Tags
                </DropdownSubMenuTrigger>
                <DropdownSubMenuContent className="thin-scrollbar max-h-[20rem] overflow-y-auto rounded-l-none">
                  <DropdownMenuLabel className="sticky top-0 bg-mineshaft-900">
                    Apply Tags to Filter Secrets
                  </DropdownMenuLabel>
                  {tags.map(({ id, slug, color }) => (
                    <DropdownMenuItem
                      onClick={(evt) => {
                        evt.preventDefault();
                        onToggleTagFilter(slug);
                      }}
                      key={id}
                      icon={filter?.tags[slug] && <FontAwesomeIcon icon={faCheckCircle} />}
                      iconPos="right"
                    >
                      <div className="flex items-center">
                        <div
                          className="mr-2 h-2 w-2 rounded-full"
                          style={{ background: color || "#bec2c8" }}
                        />
                        {slug}
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownSubMenuContent>
              </DropdownSubMenu>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div>
          {isProtectedBranch && (
            <Tooltip content={`Protected by policy ${protectedBranchPolicyName}`}>
              <IconButton variant="outline_bg" ariaLabel="protected">
                <FontAwesomeIcon icon={faLock} className="text-primary" />
              </IconButton>
            </Tooltip>
          )}
        </div>
        <div className="flex-grow" />
        <div>
          <IconButton variant="outline_bg" ariaLabel="Download" onClick={handleSecretDownload}>
            <FontAwesomeIcon icon={faDownload} />
          </IconButton>
        </div>
        <div>
          <IconButton variant="outline_bg" ariaLabel="Reveal" onClick={onVisibilityToggle}>
            <FontAwesomeIcon icon={isVisible ? faEyeSlash : faEye} />
          </IconButton>
        </div>
        <div>
          <ProjectPermissionCan
            I={ProjectPermissionActions.Read}
            a={ProjectPermissionSub.SecretRollback}
          >
            {(isAllowed) => (
              <Button
                variant="outline_bg"
                onClick={() => {
                  if (subscription && subscription.pitRecovery) {
                    onClickRollbackMode();
                    return;
                  }

                  handlePopUpOpen("upgradePlan");
                }}
                leftIcon={<FontAwesomeIcon icon={faCodeCommit} />}
                isLoading={isSnapshotCountLoading}
                className="h-10"
                isDisabled={!isAllowed}
              >
                {`${snapshotCount} ${snapshotCount === 1 ? "Snapshot" : "Snapshots"}`}
              </Button>
            )}
          </ProjectPermissionCan>
        </div>
        <div className="flex items-center">
          <ProjectPermissionCan
            I={ProjectPermissionActions.Create}
            a={subject(ProjectPermissionSub.Secrets, {
              environment,
              secretPath,
              secretName: "*",
              secretTags: ["*"]
            })}
          >
            {(isAllowed) => (
              <Button
                variant="outline_bg"
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                onClick={() => openPopUp(PopUpNames.CreateSecretForm)}
                className="h-10 rounded-r-none"
                isDisabled={!isAllowed}
              >
                Add Secret
              </Button>
            )}
          </ProjectPermissionCan>
          <DropdownMenu
            open={popUp.misc.isOpen}
            onOpenChange={(isOpen) => handlePopUpToggle("misc", isOpen)}
          >
            <DropdownMenuTrigger asChild>
              <IconButton
                ariaLabel="add-folder-or-import"
                variant="outline_bg"
                className="rounded-l-none bg-mineshaft-600 p-3"
              >
                <FontAwesomeIcon icon={faAngleDown} />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <div className="flex flex-col space-y-1 p-1.5">
                <ProjectPermissionCan
                  I={ProjectPermissionActions.Create}
                  a={subject(ProjectPermissionSub.SecretFolders, {
                    environment,
                    secretPath
                  })}
                >
                  {(isAllowed) => (
                    <Button
                      leftIcon={<FontAwesomeIcon icon={faFolderPlus} className="pr-2" />}
                      onClick={() => {
                        handlePopUpOpen("addFolder");
                        handlePopUpClose("misc");
                      }}
                      isDisabled={!isAllowed}
                      variant="outline_bg"
                      className="h-10 text-left"
                      isFullWidth
                    >
                      Add Folder
                    </Button>
                  )}
                </ProjectPermissionCan>
                <ProjectPermissionCan
                  I={ProjectPermissionDynamicSecretActions.CreateRootCredential}
                  a={subject(ProjectPermissionSub.DynamicSecrets, {
                    environment,
                    secretPath,
                    secretName: "*",
                    secretTags: ["*"],
                    metadata: ["*"]
                  })}
                >
                  {(isAllowed) => (
                    <Button
                      leftIcon={<FontAwesomeIcon icon={faFingerprint} className="pr-2" />}
                      onClick={() => {
                        if (subscription && subscription.dynamicSecret) {
                          handlePopUpOpen("addDynamicSecret");
                          handlePopUpClose("misc");
                          return;
                        }
                        handlePopUpOpen("upgradePlan");
                      }}
                      isDisabled={!isAllowed}
                      variant="outline_bg"
                      className="h-10 text-left"
                      isFullWidth
                    >
                      Add Dynamic Secret
                    </Button>
                  )}
                </ProjectPermissionCan>
                <ProjectPermissionCan
                  I={ProjectPermissionSecretRotationActions.Create}
                  a={subject(ProjectPermissionSub.SecretRotation, {
                    environment,
                    secretPath
                  })}
                >
                  {(isAllowed) => (
                    <Button
                      leftIcon={<FontAwesomeIcon icon={faRotate} className="pr-2" />}
                      onClick={() => {
                        if (subscription && subscription.secretRotation) {
                          handlePopUpOpen("addSecretRotation");
                          handlePopUpClose("misc");
                          return;
                        }
                        handlePopUpOpen("upgradePlan");
                      }}
                      variant="outline_bg"
                      className="h-10 text-left"
                      isFullWidth
                      isDisabled={!isAllowed}
                    >
                      Add Secret Rotation
                    </Button>
                  )}
                </ProjectPermissionCan>
                <ProjectPermissionCan
                  I={ProjectPermissionActions.Create}
                  a={subject(ProjectPermissionSub.SecretImports, {
                    environment,
                    secretPath
                  })}
                >
                  {(isAllowed) => (
                    <Button
                      leftIcon={<FontAwesomeIcon icon={faFileImport} className="pr-2" />}
                      onClick={() => {
                        handlePopUpOpen("addSecretImport");
                        handlePopUpClose("misc");
                      }}
                      variant="outline_bg"
                      className="h-10 text-left"
                      isFullWidth
                      isDisabled={!isAllowed}
                    >
                      Add Import
                    </Button>
                  )}
                </ProjectPermissionCan>
                <ProjectPermissionCan
                  I={ProjectPermissionActions.Create}
                  a={subject(ProjectPermissionSub.SecretFolders, {
                    environment,
                    secretPath
                  })}
                >
                  {(isAllowed) => (
                    <Button
                      leftIcon={<FontAwesomeIcon icon={faPaste} className="pr-2" />}
                      onClick={() => {
                        handlePopUpOpen("replicateFolder");
                        handlePopUpClose("misc");
                      }}
                      isDisabled={!isAllowed}
                      variant="outline_bg"
                      className="h-10 text-left"
                      isFullWidth
                    >
                      Replicate Folder
                    </Button>
                  )}
                </ProjectPermissionCan>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div
        className={twMerge(
          "h-0 flex-shrink-0 overflow-hidden transition-all",
          isMultiSelectActive && "h-16"
        )}
      >
        <div className="mt-3.5 flex items-center rounded-md border border-mineshaft-600 bg-mineshaft-800 px-4 py-2 text-bunker-300">
          <Tooltip content="Clear">
            <IconButton variant="plain" ariaLabel="clear-selection" onClick={resetSelectedSecret}>
              <FontAwesomeIcon icon={faMinusSquare} size="lg" />
            </IconButton>
          </Tooltip>
          <div className="ml-2 flex-grow px-2 text-sm">
            {Object.keys(selectedSecrets).length} Selected
          </div>
          <ProjectPermissionCan
            I={ProjectPermissionActions.Delete}
            a={subject(ProjectPermissionSub.Secrets, {
              environment,
              secretPath,
              secretName: "*",
              secretTags: ["*"]
            })}
            renderTooltip
            allowedLabel="Move"
          >
            {(isAllowed) => (
              <Button
                variant="outline_bg"
                leftIcon={<FontAwesomeIcon icon={faAnglesRight} />}
                className="ml-4"
                onClick={() => handlePopUpOpen("moveSecrets")}
                isDisabled={!isAllowed}
                size="xs"
              >
                Move
              </Button>
            )}
          </ProjectPermissionCan>
          <ProjectPermissionCan
            I={ProjectPermissionActions.Delete}
            a={subject(ProjectPermissionSub.Secrets, {
              environment,
              secretPath,
              secretName: "*",
              secretTags: ["*"]
            })}
            renderTooltip
            allowedLabel="Delete"
          >
            {(isAllowed) => (
              <Button
                variant="outline_bg"
                colorSchema="danger"
                leftIcon={<FontAwesomeIcon icon={faTrash} />}
                className="ml-2"
                onClick={() => handlePopUpOpen("bulkDeleteSecrets")}
                isDisabled={!isAllowed}
                size="xs"
              >
                Delete
              </Button>
            )}
          </ProjectPermissionCan>
        </div>
      </div>
      {/* all the side triggers from actions like modals etc */}
      <CreateSecretImportForm
        environment={environment}
        workspaceId={workspaceId}
        secretPath={secretPath}
        onUpgradePlan={() => handlePopUpOpen("upgradePlan")}
        isOpen={popUp.addSecretImport.isOpen}
        onClose={() => handlePopUpClose("addSecretImport")}
        onTogglePopUp={(isOpen) => handlePopUpToggle("addSecretImport", isOpen)}
      />
      <CreateDynamicSecretForm
        isOpen={popUp.addDynamicSecret.isOpen}
        onToggle={(isOpen) => handlePopUpToggle("addDynamicSecret", isOpen)}
        projectSlug={projectSlug}
        environments={[{ slug: environment, name: environment, id: "not-used" }]}
        secretPath={secretPath}
        isSingleEnvironmentMode
      />
      <CreateSecretRotationV2Modal
        secretPath={secretPath}
        environment={environment}
        isOpen={popUp.addSecretRotation.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addSecretRotation", isOpen)}
      />
      <Modal
        isOpen={popUp.addFolder.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addFolder", isOpen)}
      >
        <ModalContent title="Create Folder">
          <FolderForm onCreateFolder={handleFolderCreate} />
        </ModalContent>
      </Modal>
      <DeleteActionModal
        isOpen={popUp.bulkDeleteSecrets.isOpen}
        deleteKey="delete"
        title="Do you want to delete these secrets?"
        onChange={(isOpen) => handlePopUpToggle("bulkDeleteSecrets", isOpen)}
        onDeleteApproved={handleSecretBulkDelete}
        formContent={
          importedBy &&
          importedBy.length > 0 && (
            <CollapsibleSecretImports
              importedBy={importedBy}
              secretsToDelete={Object.values(selectedSecrets).map((s) => s.key)}
            />
          )
        }
      />
      <MoveSecretsModal
        popUp={popUp}
        handlePopUpToggle={handlePopUpToggle}
        onMoveApproved={handleSecretsMove}
      />
      <ReplicateFolderFromBoard
        isOpen={popUp.replicateFolder.isOpen}
        onToggle={(isOpen) => handlePopUpToggle("replicateFolder", isOpen)}
        onParsedEnv={handleParsedEnvMultiFolder}
        environment={environment}
        environments={currentWorkspace.environments}
        workspaceId={workspaceId}
        secretPath={secretPath}
      />
      {subscription && (
        <UpgradePlanModal
          isOpen={popUp.upgradePlan.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
          text={
            subscription.slug === null
              ? "You can perform this action under an Enterprise license"
              : "You can perform this action if you switch to Infisical's Team plan"
          }
        />
      )}
      <Modal
        isOpen={popUp?.confirmUpload?.isOpen}
        onOpenChange={(open) => handlePopUpToggle("confirmUpload", open)}
      >
        <ModalContent
          title="Confirm Secret Upload"
          footerContent={[
            <Button
              isLoading={isSubmitting}
              isDisabled={isSubmitting}
              colorSchema={isNonConflictingUpload ? "primary" : "danger"}
              key="overwrite-btn"
              onClick={handleSaveFolderImport}
            >
              {isNonConflictingUpload ? "Upload" : "Overwrite"}
            </Button>,
            <Button
              key="keep-old-btn"
              className="ml-4"
              onClick={() => handlePopUpClose("confirmUpload")}
              variant="outline_bg"
              isDisabled={isSubmitting}
            >
              Cancel
            </Button>
          ]}
        >
          {isNonConflictingUpload ? (
            <div>
              Are you sure you want to import {createSecretCount} secret
              {createSecretCount > 1 ? "s" : ""} to this environment?
            </div>
          ) : (
            <div className="flex flex-col text-gray-300">
              <div>Your project already contains the following {updateSecretCount} secrets:</div>
              <div className="mt-2 text-sm text-gray-400">
                {Object.keys((popUp?.confirmUpload?.data as TSecOverwriteOpt)?.update || {})
                  ?.map((key) => key)
                  .join(", ")}
              </div>
              <div className="mt-6">
                Are you sure you want to overwrite these secrets
                {createSecretCount > 0
                  ? ` and import ${createSecretCount} new
                one${createSecretCount > 1 ? "s" : ""}`
                  : ""}
                ?
              </div>
            </div>
          )}
        </ModalContent>
      </Modal>
    </>
  );
};

ActionBar.displayName = "ActionBar";
