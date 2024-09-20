import { useState } from "react";
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
  faMagnifyingGlass,
  faMinusSquare,
  faPlus,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import FileSaver from "file-saver";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
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
  Input,
  Modal,
  ModalContent,
  Tooltip,
  UpgradePlanModal
} from "@app/components/v2";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProjectPermission,
  useSubscription
} from "@app/context";
import { usePopUp } from "@app/hooks";
import { useCreateFolder, useDeleteSecretBatch, useMoveSecrets } from "@app/hooks/api";
import { fetchProjectSecrets } from "@app/hooks/api/secrets/queries";
import { SecretType, SecretV3RawSanitized, WsTag } from "@app/hooks/api/types";
import { debounce } from "@app/lib/fn/debounce";

import {
  PopUpNames,
  usePopUpAction,
  useSelectedSecretActions,
  useSelectedSecrets
} from "../../SecretMainPage.store";
import { Filter, RowType } from "../../SecretMainPage.types";
import { CreateDynamicSecretForm } from "./CreateDynamicSecretForm";
import { CreateSecretImportForm } from "./CreateSecretImportForm";
import { FolderForm } from "./FolderForm";
import { MoveSecretsModal } from "./MoveSecretsModal";

type Props = {
  secrets?: SecretV3RawSanitized[];
  // swtich the secrets type as it gets decrypted after api call
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
  onSearchChange: (term: string) => void;
  onToggleTagFilter: (tagId: string) => void;
  onVisibilityToggle: () => void;
  onToggleRowType: (rowType: RowType) => void;
  onClickRollbackMode: () => void;
};

export const ActionBar = ({
  secrets = [],
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
  onToggleRowType
}: Props) => {
  const { handlePopUpOpen, handlePopUpToggle, handlePopUpClose, popUp } = usePopUp([
    "addFolder",
    "addDynamicSecret",
    "addSecretImport",
    "bulkDeleteSecrets",
    "moveSecrets",
    "misc",
    "upgradePlan"
  ] as const);
  const { subscription } = useSubscription();
  const { openPopUp } = usePopUpAction();
  const [search, setSearch] = useState(filter.searchFilter);

  const { mutateAsync: createFolder } = useCreateFolder();
  const { mutateAsync: deleteBatchSecretV3 } = useDeleteSecretBatch();
  const { mutateAsync: moveSecrets } = useMoveSecrets();

  const selectedSecrets = useSelectedSecrets();
  const { reset: resetSelectedSecret } = useSelectedSecretActions();
  const isMultiSelectActive = Boolean(Object.keys(selectedSecrets).length);

  const { permission } = useProjectPermission();

  const shouldCheckFolderPermission = permission.rules.some((rule) =>
    (rule.subject as ProjectPermissionSub[]).includes(ProjectPermissionSub.SecretFolders)
  );

  const debouncedOnSearch = debounce(onSearchChange, 500);

  const handleFolderCreate = async (folderName: string) => {
    try {
      await createFolder({
        name: folderName,
        path: secretPath,
        environment,
        projectId: workspaceId
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
  };

  const handleSecretBulkDelete = async () => {
    const bulkDeletedSecrets = secrets.filter(({ id }) => Boolean(selectedSecrets?.[id]));
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
      const secretsToMove = secrets.filter(({ id }) => Boolean(selectedSecrets?.[id]));
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

  return (
    <>
      <div className="mt-4 flex items-center space-x-2">
        <div className="w-2/5">
          <Input
            className="bg-mineshaft-800 placeholder-mineshaft-50 duration-200 focus:bg-mineshaft-700/80"
            placeholder="Search by folder name, key name, comment..."
            leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
            value={search}
            onChange={(evt) => {
              setSearch(evt.target.value);
              debouncedOnSearch(evt.target.value);
            }}
          />
        </div>
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
                  <FontAwesomeIcon icon={faFileImport} className=" text-green-700" />
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
                  <FontAwesomeIcon icon={faFingerprint} className=" text-yellow-700" />
                  <span>Dynamic Secrets</span>
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
                  <FontAwesomeIcon icon={faKey} className=" text-bunker-300" />
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
                <DropdownSubMenuContent className="rounded-l-none">
                  <DropdownMenuLabel>Apply tags to filter secrets</DropdownMenuLabel>
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
            a={subject(ProjectPermissionSub.Secrets, { environment, secretPath })}
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
                  a={subject(
                    shouldCheckFolderPermission
                      ? ProjectPermissionSub.SecretFolders
                      : ProjectPermissionSub.Secrets,
                    { environment, secretPath }
                  )}
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
                  I={ProjectPermissionActions.Create}
                  a={subject(ProjectPermissionSub.Secrets, { environment, secretPath })}
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
                  I={ProjectPermissionActions.Create}
                  a={subject(ProjectPermissionSub.Secrets, { environment, secretPath })}
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
        <div className="mt-3.5 flex items-center rounded-md border border-mineshaft-600 bg-mineshaft-800 py-2 px-4 text-bunker-300">
          <Tooltip content="Clear">
            <IconButton variant="plain" ariaLabel="clear-selection" onClick={resetSelectedSecret}>
              <FontAwesomeIcon icon={faMinusSquare} size="lg" />
            </IconButton>
          </Tooltip>
          <div className="ml-4 flex-grow px-2 text-sm">
            {Object.keys(selectedSecrets).length} Selected
          </div>
          <ProjectPermissionCan
            I={ProjectPermissionActions.Delete}
            a={subject(ProjectPermissionSub.Secrets, { environment, secretPath })}
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
            a={subject(ProjectPermissionSub.Secrets, { environment, secretPath })}
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
        environment={environment}
        secretPath={secretPath}
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
      />
      <MoveSecretsModal
        popUp={popUp}
        handlePopUpToggle={handlePopUpToggle}
        onMoveApproved={handleSecretsMove}
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
    </>
  );
};

ActionBar.displayName = "ActionBar";
