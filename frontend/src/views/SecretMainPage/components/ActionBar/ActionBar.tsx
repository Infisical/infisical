import { useCallback } from "react"
import { subject } from "@casl/ability";
import {
  faAngleDown,
  faCheckCircle,
  faChevronRight,
  faCodeCommit,
  faDownload,
  faEye,
  faEyeSlash,
  faFileImport,
  faFilter,
  faFolderPlus,
  faMagnifyingGlass,
  faMinusSquare,
  faPlus,
  faTrash,
  faUpDownLeftRight
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import FileSaver from "file-saver";
import { twMerge } from "tailwind-merge";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
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
import { ProjectPermissionActions, ProjectPermissionSub, useSubscription } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useCreateFolder, useDeleteSecretBatch } from "@app/hooks/api";
import { DecryptedSecret, TImportedSecrets, TSecretFolder, WsTag } from "@app/hooks/api/types";

import { MoveSecretsToFolder } from "../../../../components/MoveSecrets";
import { useMoveSecrets } from "../../../../hooks/api/secrets/mutations";
import {
  PopUpNames,
  usePopUpAction,
  useSelectedSecretActions,
  useSelectedSecrets
} from "../../SecretMainPage.store";
import { Filter, GroupBy } from "../../SecretMainPage.types";
import { CreateSecretImportForm } from "./CreateSecretImportForm";
import { FolderForm } from "./FolderForm";


type Props = {
  secrets?: DecryptedSecret[];
  // swtich the secrets type as it gets decrypted after api call
  importedSecrets?: Array<Omit<TImportedSecrets, "secrets"> & { secrets: DecryptedSecret[] }>;
  environment: string;
  workspaceId: string;
  secretPath?: string;
  filter: Filter;
  tags?: WsTag[];
  isVisible?: boolean;
  snapshotCount: number;
  isSnapshotCountLoading?: boolean;
  onGroupByChange: (opt?: GroupBy) => void;
  onSearchChange: (term: string) => void;
  onToggleTagFilter: (tagId: string) => void;
  onVisiblilityToggle: () => void;
  onClickRollbackMode: () => void;
  folders: TSecretFolder[] | undefined;
};

export const ActionBar = ({
  secrets = [],
  importedSecrets = [],
  environment,
  workspaceId,
  secretPath = "/",
  filter,
  tags = [],
  isVisible,
  snapshotCount,
  isSnapshotCountLoading,
  folders,
  onSearchChange,
  onToggleTagFilter,
  onGroupByChange,
  onVisiblilityToggle,
  onClickRollbackMode
}: Props) => {
  const { handlePopUpOpen, handlePopUpToggle, handlePopUpClose, popUp } = usePopUp([
    "addFolder",
    "addSecretImport",
    "bulkDeleteSecrets",
    "misc",
    "upgradePlan",
    "moveSecrets"
  ] as const);
  const { subscription } = useSubscription();
  const { createNotification } = useNotificationContext();
  const { openPopUp } = usePopUpAction();

  const { mutateAsync: createFolder } = useCreateFolder();
  const { mutateAsync: deleteBatchSecretV3 } = useDeleteSecretBatch();

  const selectedSecrets = useSelectedSecrets();
  const { reset: resetSelectedSecret } = useSelectedSecretActions();

  /* Mutation action calls */
  const { mutateAsync: moveSecretsToFolder } = useMoveSecrets();

  const handleFolderCreate = async (folderName: string) => {
    try {
      await createFolder({
        folderName,
        directory: secretPath,
        environment,
        workspaceId
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
    const secPriority: Record<string, boolean> = {};
    const downloadedSecrets: Array<{ key: string; value: string; comment?: string }> = [];
    // load up secrets in dashboard
    secrets?.forEach(({ key, value, comment }) => {
      secPriority[key] = true;
      downloadedSecrets.push({ key, value, comment });
    });
    // now load imported secrets with secPriority
    for (let i = importedSecrets.length - 1; i >= 0; i -= 1) {
      importedSecrets[i].secrets.forEach(({ key, value, comment }) => {
        if (secPriority?.[key]) return;
        downloadedSecrets.unshift({ key, value, comment });
        secPriority[key] = true;
      });
    }

    const file = downloadedSecrets
      .sort((a, b) => a.key.toLowerCase().localeCompare(b.key.toLowerCase()))
      .reduce(
        (prev, { key, value, comment }, index) =>
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
    const bulkDeletedSecrets = secrets.filter(({ _id }) => Boolean(selectedSecrets?.[_id]));
    try {
      await deleteBatchSecretV3({
        secretPath,
        workspaceId,
        environment,
        secrets: bulkDeletedSecrets.map(({ key }) => ({ secretName: key, type: "shared" }))
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

  const onMoveSecrets = async (folderId: string, secretsToMove: { _id: string }[]) => {
    try {
      await moveSecretsToFolder({
        secrets: secretsToMove,
        folderId,
        workspaceId,
        environment,
        secretPath
      });
      resetSelectedSecret();
      handlePopUpClose("moveSecrets")
      createNotification({
        text: `Successfully moved  ${Object.keys(selectedSecrets).length > 1 ? "secrets" : "secret"}`,
        type: "success"
      });
    } catch (error) {
      createNotification({
        text: `Failed to move ${Object.keys(selectedSecrets).length > 1 ? "secrets" : "secret"}`,
        type: "error"
      });
    }
  }

  const handleMoveSecretsModalOpen = useCallback(() => handlePopUpOpen("moveSecrets"), []);

  const checkedSecrets = Object.keys(selectedSecrets).map((secretId) => ({
    _id: secretId,
  }));


  return (
    <>
      <div className="flex items-center space-x-2 mt-4">
        <div className={twMerge("fixed transform  flex justify-center opacity-0 bottom-[20px] left-[220px] scale-50 right-0 z-10 pointer-events-none translate-y-20  transition-all duration-300", Object.keys(selectedSecrets).length > 0 && "translate-y-0 scale-100 opacity-100")}>
          <div className="flex flex-initial items-center justify-center shadow-md  bg-mineshaft-800 border border-mineshaft-500 rounded-[4px] pt-[8px] pr-[8px] pb-[8px] pl-[16px] pointer-events-auto gap-[16px]">
            <span className="flex  min-w-[65px] text-gray-300">
              <Tooltip content="Clear">
                <IconButton variant="plain" ariaLabel="clear-selection" onClick={resetSelectedSecret}>
                  <FontAwesomeIcon icon={faMinusSquare} size="lg" />
                </IconButton>
              </Tooltip>
              <div className="text-sm ml-4 px-2 flex-grow">
                {Object.keys(selectedSecrets).length} Selected
              </div>
            </span>
            <div className="flex gap-2">
              <div className="bg-mineshaft-700 hover:bg-mineshaft-500 cursor-pointer flex justify-center items-center border border-mineshaft-500 rounded-md px-[15px] py-1.5 text-gray-200"
                role="button"
                onClick={() => handleMoveSecretsModalOpen()}
                tabIndex={-1}
                onKeyUp={() => { }}>
                <FontAwesomeIcon icon={faUpDownLeftRight} className="mr-2.5" />
                Move
              </div>
            </div>
            <div role="button" className="bg-mineshaft-700 hover:bg-mineshaft-500  cursor-pointer flex justify-center items-center border rounded-md border-mineshaft-500 px-[15px] py-1.5 text-gray-200"
              onClick={() => handlePopUpOpen("bulkDeleteSecrets")}
              tabIndex={-1}
              onKeyUp={() => { }} >
              <FontAwesomeIcon icon={faTrash} className="mr-2.5" />
              Delete
            </div>
          </div>
        </div>
        {/* Bult secrets move modal */}
        <Modal
          isOpen={popUp?.moveSecrets?.isOpen}
          onOpenChange={(open) => {
            handlePopUpToggle("moveSecrets", open);
          }}
        >
          <ModalContent
            title={`Move  ${Object.keys(selectedSecrets).length > 1 ? "secrets" : "secret"} to another folder`}
            subTitle="choose a folder you wish to move secrets to below"
          >
            <MoveSecretsToFolder
              onMoveSecrets={onMoveSecrets}
              checkedSecrets={checkedSecrets}
              folderData={folders}
            />
          </ModalContent>
        </Modal>
        <div className="w-2/5">
          <Input
            className="bg-mineshaft-800 placeholder-mineshaft-50 duration-200 focus:bg-mineshaft-700/80"
            placeholder="Search by folder name, key name, comment..."
            leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
            value={filter.searchFilter}
            onChange={(evt) => onSearchChange(evt.target.value)}
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
                  Object.keys(filter.tags).length && "text-primary border-primary/50"
                )}
              >
                <FontAwesomeIcon icon={faFilter} />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="p-0">
              <DropdownMenuGroup>Group By</DropdownMenuGroup>
              <DropdownMenuItem
                iconPos="right"
                icon={
                  filter?.groupBy === GroupBy.PREFIX && <FontAwesomeIcon icon={faCheckCircle} />
                }
                onClick={() => onGroupByChange(!filter.groupBy ? GroupBy.PREFIX : undefined)}
              >
                Prefix
              </DropdownMenuItem>
              <DropdownMenuGroup>Filter By</DropdownMenuGroup>
              <DropdownSubMenu>
                <DropdownSubMenuTrigger
                  iconPos="right"
                  icon={<FontAwesomeIcon icon={faChevronRight} size="sm" />}
                >
                  Tags
                </DropdownSubMenuTrigger>
                <DropdownSubMenuContent className="rounded-l-none">
                  <DropdownMenuLabel>Apply tags to filter secrets</DropdownMenuLabel>
                  {tags.map(({ _id, name, tagColor }) => (
                    <DropdownMenuItem
                      onClick={(evt) => {
                        evt.preventDefault();
                        onToggleTagFilter(_id);
                      }}
                      key={_id}
                      icon={filter?.tags[_id] && <FontAwesomeIcon icon={faCheckCircle} />}
                      iconPos="right"
                    >
                      <div className="flex items-center">
                        <div
                          className="w-2 h-2 rounded-full mr-2"
                          style={{ background: tagColor || "#bec2c8" }}
                        />
                        {name}
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
          <IconButton variant="outline_bg" ariaLabel="Reveal" onClick={onVisiblilityToggle}>
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
                {snapshotCount} Commits
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
                className="rounded-r-none h-10"
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
              <div className="p-1.5 flex flex-col space-y-1">
                <ProjectPermissionCan
                  I={ProjectPermissionActions.Create}
                  a={subject(ProjectPermissionSub.Secrets, { environment, secretPath })}
                >
                  {(isAllowed) => (
                    <Button
                      leftIcon={<FontAwesomeIcon icon={faFolderPlus} />}
                      onClick={() => {
                        handlePopUpOpen("addFolder");
                        handlePopUpClose("misc");
                      }}
                      isDisabled={!isAllowed}
                      variant="outline_bg"
                      className="h-10"
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
                      leftIcon={<FontAwesomeIcon icon={faFileImport} />}
                      onClick={() => {
                        handlePopUpOpen("addSecretImport");
                        handlePopUpClose("misc");
                      }}
                      variant="outline_bg"
                      className="h-10"
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
      <CreateSecretImportForm
        environment={environment}
        workspaceId={workspaceId}
        secretPath={secretPath}
        isOpen={popUp.addSecretImport.isOpen}
        onClose={() => handlePopUpClose("addSecretImport")}
        onTogglePopUp={(isOpen) => handlePopUpToggle("addSecretImport", isOpen)}
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
      {subscription && (
        <UpgradePlanModal
          isOpen={popUp.upgradePlan.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
          text={
            subscription.slug === null
              ? "You can perform point-in-time recovery under an Enterprise license"
              : "You can perform point-in-time recovery if you switch to Infisical's Team plan"
          }
        />
      )}
    </>
  );
};

ActionBar.displayName = "ActionBar";
