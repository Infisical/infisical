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
  faFolderPlus,
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
import { decryptAssymmetric } from "@app/components/utilities/cryptography/crypto";
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
import { interpolateSecrets } from "@app/helpers/secret";
import { usePopUp } from "@app/hooks";
import {
  useCreateFolder,
  useDeleteSecretBatch,
  useGetUserWsKey,
  useMoveSecrets
} from "@app/hooks/api";
import { DecryptedSecret, SecretType, TImportedSecrets, WsTag } from "@app/hooks/api/types";
import { debounce } from "@app/lib/fn/debounce";

import {
  PopUpNames,
  usePopUpAction,
  useSelectedSecretActions,
  useSelectedSecrets
} from "../../SecretMainPage.store";
import { Filter, GroupBy } from "../../SecretMainPage.types";
import { CreateDynamicSecretForm } from "./CreateDynamicSecretForm";
import { CreateSecretImportForm } from "./CreateSecretImportForm";
import { FolderForm } from "./FolderForm";
import { MoveSecretsModal } from "./MoveSecretsModal";

type Props = {
  secrets?: DecryptedSecret[];
  // swtich the secrets type as it gets decrypted after api call
  importedSecrets?: Array<Omit<TImportedSecrets, "secrets"> & { secrets: DecryptedSecret[] }>;
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
  onGroupByChange: (opt?: GroupBy) => void;
  onSearchChange: (term: string) => void;
  onToggleTagFilter: (tagId: string) => void;
  onVisiblilityToggle: () => void;
  onClickRollbackMode: () => void;
};

export const ActionBar = ({
  secrets = [],
  importedSecrets = [],
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
  onGroupByChange,
  onVisiblilityToggle,
  onClickRollbackMode
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
  const { data: decryptFileKey } = useGetUserWsKey(workspaceId);

  const selectedSecrets = useSelectedSecrets();
  const { reset: resetSelectedSecret } = useSelectedSecretActions();
  const isMultiSelectActive = Boolean(Object.keys(selectedSecrets).length);

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
    const secPriority: Record<string, boolean> = {};
    const downloadedSecrets: Array<{ key: string; value: string; comment?: string }> = [];

    const PRIVATE_KEY = localStorage.getItem("PRIVATE_KEY") as string;
    const workspaceKey = decryptAssymmetric({
      ciphertext: decryptFileKey!.encryptedKey,
      nonce: decryptFileKey!.nonce,
      publicKey: decryptFileKey!.sender.publicKey,
      privateKey: PRIVATE_KEY
    });

    const expandSecrets = interpolateSecrets({
      projectId: workspaceId,
      secretEncKey: workspaceKey
    });

    const secretRecord: Record<
      string,
      { value: string; comment?: string; skipMultilineEncoding?: boolean }
    > = {};

    // load up secrets in dashboard
    secrets?.forEach(({ key, value, valueOverride, comment }) => {
      secPriority[key] = true;
      downloadedSecrets.push({ key, value: valueOverride || value, comment });
    });
    // now load imported secrets with secPriority
    for (let i = importedSecrets.length - 1; i >= 0; i -= 1) {
      importedSecrets[i].secrets.forEach(({ key, value, valueOverride, comment }) => {
        if (secPriority?.[key]) return;
        downloadedSecrets.unshift({ key, value: valueOverride || value, comment });
        secPriority[key] = true;
      });
    }

    downloadedSecrets.forEach((secret) => {
      secretRecord[secret.key] = {
        value: secret.value,
        comment: secret.comment
      };
    });

    await expandSecrets(secretRecord);

    const file = downloadedSecrets
      .sort((a, b) => a.key.toLowerCase().localeCompare(b.key.toLowerCase()))
      .reduce(
        (prev, { key, comment }, index) =>
          prev +
          (comment
            ? `${index === 0 ? "#" : "\n#"} ${comment}\n${key}=${secretRecord[key].value}\n`
            : `${key}=${secretRecord[key].value}\n`),
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
        secrets: bulkDeletedSecrets.map(({ key }) => ({ secretName: key, type: SecretType.Shared }))
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
                  Object.keys(filter.tags).length && "border-primary/50 text-primary"
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
                  {tags.map(({ id, name, color }) => (
                    <DropdownMenuItem
                      onClick={(evt) => {
                        evt.preventDefault();
                        onToggleTagFilter(id);
                      }}
                      key={id}
                      icon={filter?.tags[id] && <FontAwesomeIcon icon={faCheckCircle} />}
                      iconPos="right"
                    >
                      <div className="flex items-center">
                        <div
                          className="mr-2 h-2 w-2 rounded-full"
                          style={{ background: color || "#bec2c8" }}
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
                  a={subject(ProjectPermissionSub.Secrets, { environment, secretPath })}
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
