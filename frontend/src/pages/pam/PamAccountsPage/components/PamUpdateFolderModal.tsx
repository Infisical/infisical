import { createNotification } from "@app/components/notifications";
import { Modal, ModalContent } from "@app/components/v2";
import { TPamFolder, useUpdatePamFolder } from "@app/hooks/api/pam";

import { PamFolderForm } from "./PamFolderForm";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  folder?: TPamFolder;
};

export const PamUpdateFolderModal = ({ isOpen, onOpenChange, folder }: Props) => {
  const updatePamFolder = useUpdatePamFolder();

  if (!folder) return null;

  const onSubmit = async (formData: Pick<TPamFolder, "name" | "description">) => {
    await updatePamFolder.mutateAsync({
      ...formData,
      folderId: folder.id
    });
    createNotification({
      text: "Successfully updated folder",
      type: "success"
    });
    onOpenChange(false);
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-2xl" title="Edit Account" subTitle="Update account details.">
        <PamFolderForm onSubmit={onSubmit} folder={folder} />
      </ModalContent>
    </Modal>
  );
};
