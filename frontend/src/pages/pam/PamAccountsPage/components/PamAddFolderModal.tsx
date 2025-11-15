import { createNotification } from "@app/components/notifications";
import { Modal, ModalContent } from "@app/components/v2";
import { TPamFolder, useCreatePamFolder } from "@app/hooks/api/pam";

import { PamFolderForm } from "./PamFolderForm";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
  currentFolderId: string | null;
};

export const PamAddFolderModal = ({ isOpen, onOpenChange, projectId, currentFolderId }: Props) => {
  const createPamFolder = useCreatePamFolder();

  const onSubmit = async (formData: Pick<TPamFolder, "name" | "description">) => {
    await createPamFolder.mutateAsync({
      ...formData,
      parentId: currentFolderId,
      projectId
    });
    createNotification({
      text: "Successfully created folder",
      type: "success"
    });
    onOpenChange(false);
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-2xl" title="Create Folder">
        <PamFolderForm onSubmit={onSubmit} />
      </ModalContent>
    </Modal>
  );
};
