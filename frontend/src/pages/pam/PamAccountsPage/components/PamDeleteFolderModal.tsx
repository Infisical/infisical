import { createNotification } from "@app/components/notifications";
import { DeleteActionModal } from "@app/components/v2";
import { TPamFolder, useDeletePamFolder } from "@app/hooks/api/pam";

type Props = {
  folder?: TPamFolder;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const PamDeleteFolderModal = ({ isOpen, onOpenChange, folder }: Props) => {
  const deletePamFolder = useDeletePamFolder();

  if (!folder) return null;

  const { id: folderId, name } = folder;

  const handleDelete = async () => {
    try {
      await deletePamFolder.mutateAsync({
        folderId
      });

      createNotification({
        text: "Successfully deleted folder",
        type: "success"
      });

      onOpenChange(false);
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to delete folder",
        type: "error"
      });
    }
  };

  return (
    <DeleteActionModal
      isOpen={isOpen}
      onChange={onOpenChange}
      title={`Are you sure you want to delete ${name}?`}
      deleteKey={name}
      onDeleteApproved={handleDelete}
    />
  );
};
