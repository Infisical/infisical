import { subject } from "@casl/ability";
import {
  faClose,
  faEdit,
  faFolder,
  faInfoCircle,
  faPencilSquare,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, IconButton, Modal, ModalContent } from "@app/components/v2";
import { Tooltip } from "@app/components/v2/Tooltip/Tooltip";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectPermissionActions, ProjectPermissionSub, useSubscription } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useDeleteFolder, useUpdateFolder } from "@app/hooks/api";
import { PendingAction, TSecretFolder } from "@app/hooks/api/secretFolders/types";
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";

import {
  PendingFolderCreate,
  PendingFolderDelete,
  PendingFolderUpdate,
  useBatchMode,
  useBatchModeActions
} from "../../SecretMainPage.store";
import { FolderForm } from "../ActionBar/FolderForm";

type Props = {
  folders?: TSecretFolder[];
  environment: string;
  projectId: string;
  secretPath?: string;
  onNavigateToFolder: (path: string) => void;
  canNavigate: boolean;
};

export const FolderListView = ({
  folders = [],
  environment,
  projectId,
  secretPath = "/",
  onNavigateToFolder,
  canNavigate
}: Props) => {
  const { popUp, handlePopUpToggle, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "updateFolder",
    "deleteFolder"
  ] as const);
  const navigate = useNavigate({ from: ROUTE_PATHS.SecretManager.SecretDashboardPage.path });
  const secretPathQueryparam = useSearch({
    from: ROUTE_PATHS.SecretManager.SecretDashboardPage.id,
    select: (el) => el.secretPath
  });
  const { subscription } = useSubscription();

  const { mutateAsync: updateFolder } = useUpdateFolder();
  const { mutateAsync: deleteFolder } = useDeleteFolder();
  const { isBatchMode } = useBatchMode();
  const { addPendingChange, removePendingChange } = useBatchModeActions();

  const handleFolderUpdate = async (
    newFolderName: string,
    newFolderDescription: string | null,
    oldFolderName?: string,
    oldFolderDescription?: string
  ) => {
    const updateFolderData = popUp.updateFolder.data;
    if (!updateFolderData) throw new Error("Update folder data is required");
    const { id: folderId, pendingAction, isPending } = updateFolderData as TSecretFolder;

    if (isBatchMode) {
      const isEditingPendingCreation = isPending && pendingAction === PendingAction.Create;

      if (isEditingPendingCreation) {
        const updatedCreate: PendingFolderCreate = {
          id: folderId,
          type: PendingAction.Create,
          folderName: newFolderName,
          description: newFolderDescription || undefined,
          parentPath: secretPath,
          timestamp: Date.now(),
          resourceType: "folder"
        };

        addPendingChange(updatedCreate, {
          projectId,
          environment,
          secretPath
        });
      } else {
        const updateChange: PendingFolderUpdate = {
          id: folderId,
          type: PendingAction.Update,
          originalFolderName: oldFolderName || "",
          folderName: newFolderName,
          originalDescription: oldFolderDescription,
          description: newFolderDescription || undefined,
          timestamp: Date.now(),
          resourceType: "folder"
        };

        addPendingChange(updateChange, {
          projectId,
          environment,
          secretPath
        });
      }

      handlePopUpClose("updateFolder");
      return;
    }

    await updateFolder({
      folderId,
      name: newFolderName,
      path: secretPath,
      environment,
      projectId,
      description: newFolderDescription
    });
    handlePopUpClose("updateFolder");
    createNotification({
      type: "success",
      text: "Successfully saved folder"
    });
  };

  const handleDeletePending = (id: string) => {
    removePendingChange(id, "folder", {
      projectId,
      environment,
      secretPath
    });
  };

  const handleFolderDelete = async () => {
    const folderData = popUp.deleteFolder?.data as TSecretFolder;

    if (isBatchMode) {
      const pendingFolderDelete: PendingFolderDelete = {
        id: folderData.id,
        folderName: folderData.name,
        folderPath: secretPath,
        resourceType: "folder",
        type: PendingAction.Delete,
        timestamp: Date.now()
      };

      addPendingChange(pendingFolderDelete, {
        projectId,
        environment,
        secretPath
      });

      handlePopUpClose("deleteFolder");
      return;
    }

    await deleteFolder({
      folderId: folderData.id,
      path: secretPath,
      environment,
      projectId
    });

    handlePopUpClose("deleteFolder");
    createNotification({
      type: "success",
      text: "Successfully deleted folder"
    });
  };

  const handleFolderClick = (name: string, isPending?: boolean) => {
    if (isPending || !canNavigate) {
      return;
    }
    const path = `${secretPathQueryparam === "/" ? "" : secretPathQueryparam}/${name}`;
    navigate({
      search: (el) => ({ ...el, secretPath: path })
    }).then(() => onNavigateToFolder(path));
  };

  return (
    <>
      {folders.map(({ name, id, description, pendingAction, isPending }) => (
        <div
          key={id}
          className={twMerge(
            "group flex cursor-pointer border-b border-mineshaft-600 hover:bg-mineshaft-700",
            isPending && "bg-mineshaft-700/60",
            pendingAction === PendingAction.Delete && "border-l-2 border-l-red-600/75",
            pendingAction === PendingAction.Update && "border-l-2 border-l-yellow-600/75",
            pendingAction === PendingAction.Create && "border-l-2 border-l-green-600/75"
          )}
        >
          <div className="flex w-11 items-center px-5 py-3 text-yellow-700">
            <FontAwesomeIcon icon={faFolder} />
          </div>
          <div
            className="flex grow items-center px-4 py-3"
            role="button"
            tabIndex={0}
            onKeyDown={(evt) => {
              if (evt.key === "Enter") handleFolderClick(name, isPending);
            }}
            onClick={() => handleFolderClick(name, isPending)}
          >
            {name}
            {description && (
              <Tooltip
                position="right"
                className="flex max-w-lg items-center space-x-4 py-4 whitespace-pre-wrap"
                content={description}
              >
                <FontAwesomeIcon icon={faInfoCircle} className="ml-1 text-mineshaft-400" />
              </Tooltip>
            )}
          </div>
          {isPending ? (
            <div className="flex w-16 items-center justify-between border-l border-mineshaft-600 px-3 py-3">
              <IconButton
                ariaLabel="edit-folder"
                variant="plain"
                size="sm"
                className="p-0 opacity-0 group-hover:opacity-100"
                isDisabled
                onClick={() => {}}
              >
                <FontAwesomeIcon icon={faPencilSquare} size="lg" />
              </IconButton>

              <IconButton
                ariaLabel="delete-folder"
                variant="plain"
                size="md"
                className="p-0 opacity-0 group-hover:opacity-100"
                onClick={() => handleDeletePending(id)}
              >
                <FontAwesomeIcon icon={faClose} size="lg" />
              </IconButton>
            </div>
          ) : (
            <div className="flex w-16 items-center justify-between border-l border-mineshaft-600 px-3 py-3">
              <ProjectPermissionCan
                I={ProjectPermissionActions.Edit}
                a={subject(ProjectPermissionSub.SecretFolders, { environment, secretPath })}
                renderTooltip
                allowedLabel="Edit"
              >
                {(isAllowed) => (
                  <IconButton
                    ariaLabel="edit-folder"
                    variant="plain"
                    size="sm"
                    className="p-0 opacity-0 group-hover:opacity-100"
                    onClick={() => handlePopUpOpen("updateFolder", { id, name, description })}
                    isDisabled={!isAllowed}
                  >
                    <FontAwesomeIcon icon={faEdit} />
                  </IconButton>
                )}
              </ProjectPermissionCan>
              <ProjectPermissionCan
                I={ProjectPermissionActions.Delete}
                a={subject(ProjectPermissionSub.SecretFolders, { environment, secretPath })}
                renderTooltip
                allowedLabel="Delete"
              >
                {(isAllowed) => (
                  <IconButton
                    ariaLabel="delete-folder"
                    variant="plain"
                    colorSchema="danger"
                    size="md"
                    className="p-0 opacity-0 group-hover:opacity-100"
                    onClick={() => handlePopUpOpen("deleteFolder", { id, name })}
                    isDisabled={!isAllowed}
                  >
                    <FontAwesomeIcon icon={faTrash} />
                  </IconButton>
                )}
              </ProjectPermissionCan>
            </div>
          )}
        </div>
      ))}
      <Modal
        isOpen={popUp.updateFolder.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("updateFolder", isOpen)}
      >
        <ModalContent title="Edit Folder">
          <FolderForm
            isEdit
            defaultFolderName={(popUp.updateFolder?.data as TSecretFolder)?.name}
            defaultDescription={(popUp.updateFolder?.data as TSecretFolder)?.description}
            onUpdateFolder={handleFolderUpdate}
          />
        </ModalContent>
      </Modal>
      <DeleteActionModal
        isOpen={popUp.deleteFolder.isOpen}
        deleteKey={(popUp.deleteFolder?.data as TSecretFolder)?.name}
        title="Do you want to delete this folder?"
        subTitle={`This folder and all its contents will be removed. ${
          subscription?.get(SubscriptionProductCategory.SecretManager, "pitRecovery")
            ? "You can reverse this action by rolling back to a previous commit."
            : "Rolling back to a previous commit isn't available on your current plan. Upgrade to enable this feature."
        }`}
        onChange={(isOpen) => handlePopUpToggle("deleteFolder", isOpen)}
        onDeleteApproved={handleFolderDelete}
      />
    </>
  );
};
