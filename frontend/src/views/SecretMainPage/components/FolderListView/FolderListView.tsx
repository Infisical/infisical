import { useRouter } from "next/router";
import { subject } from "@casl/ability";
import { faClose, faFolder, faPencilSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, IconButton, Modal, ModalContent } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useDeleteFolder, useUpdateFolder } from "@app/hooks/api";
import { TSecretFolder } from "@app/hooks/api/secretFolders/types";

import { SortDir } from "../../SecretMainPage.types";
import { FolderForm } from "../ActionBar/FolderForm";

type Props = {
  folders?: TSecretFolder[];
  environment: string;
  workspaceId: string;
  secretPath?: string;
  sortDir: SortDir;
};

export const FolderListView = ({
  folders = [],
  environment,
  workspaceId,
  secretPath = "/",
  sortDir = SortDir.ASC
}: Props) => {
  const { popUp, handlePopUpToggle, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "updateFolder",
    "deleteFolder"
  ] as const);
  const router = useRouter();

  const { createNotification } = useNotificationContext();

  const { mutateAsync: updateFolder } = useUpdateFolder();
  const { mutateAsync: deleteFolder } = useDeleteFolder();

  const handleFolderUpdate = async (newFolderName: string) => {
    try {
      await updateFolder({
        folderName: popUp.updateFolder.data as string,
        name: newFolderName,
        directory: secretPath,
        environment,
        workspaceId
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
      await deleteFolder({
        folderName: popUp.deleteFolder.data as string,
        directory: secretPath,
        environment,
        workspaceId
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
    router.push({
      pathname: router.pathname,
      query: {
        ...router.query,
        secretPath: `${router.query?.secretPath || ""}/${name}`
      }
    });
  };

  return (
    <>
      {folders
        .sort((a, b) =>
          sortDir === SortDir.ASC
            ? a.name.toLowerCase().localeCompare(b.name.toLowerCase())
            : b.name.toLowerCase().localeCompare(a.name.toLowerCase())
        )
        .map(({ name, id }) => (
          <div
            key={id}
            className="flex group border-b border-mineshaft-600 hover:bg-mineshaft-700 cursor-pointer"
          >
            <div className="w-12 px-4 py-2 text-yellow-700 flex items-center">
              <FontAwesomeIcon icon={faFolder} />
            </div>
            <div
              className="flex-grow px-4 py-2 flex items-center"
              role="button"
              tabIndex={0}
              onKeyDown={(evt) => {
                if (evt.key === "Enter") handleFolderClick(name);
              }}
              onClick={() => handleFolderClick(name)}
            >
              {name}
            </div>
            <div className="px-3 py-2 flex items-center space-x-4 border-l border-mineshaft-600">
              <ProjectPermissionCan
                I={ProjectPermissionActions.Edit}
                a={subject(ProjectPermissionSub.Secrets, { environment, secretPath })}
                renderTooltip
                allowedLabel="Edit"
              >
                {(isAllowed) => (
                  <IconButton
                    ariaLabel="edit-folder"
                    variant="plain"
                    size="sm"
                    className="group-hover:opacity-100 opacity-0 p-0"
                    onClick={() => handlePopUpOpen("updateFolder", name)}
                    isDisabled={!isAllowed}
                  >
                    <FontAwesomeIcon icon={faPencilSquare} size="lg" />
                  </IconButton>
                )}
              </ProjectPermissionCan>
              <ProjectPermissionCan
                I={ProjectPermissionActions.Delete}
                a={subject(ProjectPermissionSub.Secrets, { environment, secretPath })}
                renderTooltip
                allowedLabel="Delete"
              >
                {(isAllowed) => (
                  <IconButton
                    ariaLabel="delete-folder"
                    variant="plain"
                    size="md"
                    className="group-hover:opacity-100 opacity-0 p-0"
                    onClick={() => handlePopUpOpen("deleteFolder", name)}
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
            defaultFolderName={popUp.updateFolder.data as string}
            onUpdateFolder={handleFolderUpdate}
          />
        </ModalContent>
      </Modal>
      <DeleteActionModal
        isOpen={popUp.deleteFolder.isOpen}
        deleteKey={popUp.deleteFolder?.data as string}
        title="Do you want to delete this folder?"
        onChange={(isOpen) => handlePopUpToggle("deleteFolder", isOpen)}
        onDeleteApproved={handleFolderDelete}
      />
    </>
  );
};
