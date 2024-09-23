import { useRouter } from "next/router";
import { subject } from "@casl/ability";
import { faClose, faFolder, faPencilSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, IconButton, Modal, ModalContent } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useProjectPermission } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useDeleteFolder, useUpdateFolder } from "@app/hooks/api";
import { TSecretFolder } from "@app/hooks/api/secretFolders/types";

import { FolderForm } from "../ActionBar/FolderForm";

type Props = {
  folders?: TSecretFolder[];
  environment: string;
  workspaceId: string;
  secretPath?: string;
};

export const FolderListView = ({
  folders = [],
  environment,
  workspaceId,
  secretPath = "/"
}: Props) => {
  const { popUp, handlePopUpToggle, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "updateFolder",
    "deleteFolder"
  ] as const);
  const router = useRouter();
  const { permission } = useProjectPermission();

  const shouldCheckFolderPermission = permission.rules.some((rule) =>
    (rule.subject as ProjectPermissionSub[]).includes(ProjectPermissionSub.SecretFolders)
  );

  const { mutateAsync: updateFolder } = useUpdateFolder();
  const { mutateAsync: deleteFolder } = useDeleteFolder();

  const handleFolderUpdate = async (newFolderName: string) => {
    try {
      const { id: folderId } = popUp.updateFolder.data as TSecretFolder;
      await updateFolder({
        folderId,
        name: newFolderName,
        path: secretPath,
        environment,
        projectId: workspaceId
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
      {folders.map(({ name, id }) => (
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
          </div>
          <div className="flex items-center space-x-4 border-l border-mineshaft-600 px-3 py-3">
            <ProjectPermissionCan
              I={ProjectPermissionActions.Edit}
              a={subject(
                shouldCheckFolderPermission
                  ? ProjectPermissionSub.SecretFolders
                  : ProjectPermissionSub.Secrets,
                { environment, secretPath }
              )}
              renderTooltip
              allowedLabel="Edit"
            >
              {(isAllowed) => (
                <IconButton
                  ariaLabel="edit-folder"
                  variant="plain"
                  size="sm"
                  className="p-0 opacity-0 group-hover:opacity-100"
                  onClick={() => handlePopUpOpen("updateFolder", { id, name })}
                  isDisabled={!isAllowed}
                >
                  <FontAwesomeIcon icon={faPencilSquare} size="lg" />
                </IconButton>
              )}
            </ProjectPermissionCan>
            <ProjectPermissionCan
              I={ProjectPermissionActions.Delete}
              a={subject(
                shouldCheckFolderPermission
                  ? ProjectPermissionSub.SecretFolders
                  : ProjectPermissionSub.Secrets,
                { environment, secretPath }
              )}
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
