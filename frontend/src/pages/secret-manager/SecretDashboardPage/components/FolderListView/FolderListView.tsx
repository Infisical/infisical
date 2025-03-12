import { subject } from "@casl/ability";
import { faClose, faFolder, faInfoCircle, faPencilSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate, useSearch } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, IconButton, Modal, ModalContent } from "@app/components/v2";
import { Tooltip } from "@app/components/v2/Tooltip/Tooltip";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useDeleteFolder, useUpdateFolder } from "@app/hooks/api";
import { TSecretFolder } from "@app/hooks/api/secretFolders/types";

import { FolderForm } from "../ActionBar/FolderForm";

type Props = {
  folders?: TSecretFolder[];
  environment: string;
  workspaceId: string;
  secretPath?: string;
  onNavigateToFolder: (path: string) => void;
};

export const FolderListView = ({
  folders = [],
  environment,
  workspaceId,
  secretPath = "/",
  onNavigateToFolder
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

  const { mutateAsync: updateFolder } = useUpdateFolder();
  const { mutateAsync: deleteFolder } = useDeleteFolder();

  const handleFolderUpdate = async (newFolderName: string, newFolderDescription: string | null) => {
    try {
      const { id: folderId } = popUp.updateFolder.data as TSecretFolder;
      await updateFolder({
        folderId,
        name: newFolderName,
        path: secretPath,
        environment,
        projectId: workspaceId,
        description: newFolderDescription
      });
      handlePopUpClose("updateFolder");
      createNotification({
        type: "success",
        text: "Successfully saved folder"
      });
    } catch (error) {
      console.log(error);
      createNotification({
        type: "error",
        text: "Failed to save folder"
      });
    }
  };

  const handleFolderDelete = async () => {
    try {
      const { id: folderId } = popUp.deleteFolder.data as TSecretFolder;
      await deleteFolder({
        folderId,
        path: secretPath,
        environment,
        projectId: workspaceId
      });
      handlePopUpClose("deleteFolder");
      createNotification({
        type: "success",
        text: "Successfully deleted folder"
      });
    } catch (error) {
      console.log(error);
      createNotification({
        type: "error",
        text: "Failed to delete folder"
      });
    }
  };

  const handleFolderClick = (name: string) => {
    const path = `${secretPathQueryparam === "/" ? "" : secretPathQueryparam}/${name}`;
    navigate({
      search: (el) => ({ ...el, secretPath: path })
    }).then(() => onNavigateToFolder(path));
  };

  return (
    <>
      {folders.map(({ name, id, description }) => (
        <div
          key={id}
          className="group flex cursor-pointer border-b border-mineshaft-600 hover:bg-mineshaft-700"
        >
          <div className="flex w-11 items-center px-5 py-3 text-yellow-700">
            <FontAwesomeIcon icon={faFolder} />
          </div>
          <div
            className="flex flex-grow items-center px-4 py-3"
            role="button"
            tabIndex={0}
            onKeyDown={(evt) => {
              if (evt.key === "Enter") handleFolderClick(name);
            }}
            onClick={() => handleFolderClick(name)}
          >
            {name}
            {description && (
              <Tooltip
                position="right"
                className="flex max-w-lg items-center space-x-4 whitespace-pre-wrap py-4"
                content={description}
              >
                <FontAwesomeIcon icon={faInfoCircle} className="ml-1 text-mineshaft-400" />
              </Tooltip>
            )}
          </div>
          <div className="flex items-center space-x-4 border-l border-mineshaft-600 px-3 py-3">
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
                  <FontAwesomeIcon icon={faPencilSquare} size="lg" />
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
                  size="md"
                  className="p-0 opacity-0 group-hover:opacity-100"
                  onClick={() => handlePopUpOpen("deleteFolder", { id, name })}
                  isDisabled={!isAllowed}
                >
                  <FontAwesomeIcon icon={faClose} size="lg" />
                </IconButton>
              )}
            </ProjectPermissionCan>
          </div>
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
        onChange={(isOpen) => handlePopUpToggle("deleteFolder", isOpen)}
        onDeleteApproved={handleFolderDelete}
      />
    </>
  );
};
