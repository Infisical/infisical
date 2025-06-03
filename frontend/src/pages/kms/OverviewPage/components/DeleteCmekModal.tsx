import { createNotification } from "@app/components/notifications";
import { DeleteActionModal } from "@app/components/v2";
import { TCmek, useDeleteCmek } from "@app/hooks/api/cmeks";

type Props = {
  cmek: TCmek;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const DeleteCmekModal = ({ isOpen, onOpenChange, cmek }: Props) => {
  const deleteCmek = useDeleteCmek();

  if (!cmek) return null;

  const { id: keyId, projectId, name } = cmek;

  const handleDeleteCmek = async () => {
    try {
      await deleteCmek.mutateAsync({
        keyId,
        projectId
      });

      createNotification({
        text: "Key successfully deleted",
        type: "success"
      });

      onOpenChange(false);
    } catch (err) {
      console.error(err);
      const error = err as any;
      const text = error?.response?.data?.message ?? "Failed to delete key";

      createNotification({
        text,
        type: "error"
      });
    }
  };

  return (
    <DeleteActionModal
      isOpen={isOpen}
      title={`Are you sure you want to delete ${name}?`}
      onChange={onOpenChange}
      deleteKey="confirm"
      onDeleteApproved={handleDeleteCmek}
    />
  );
};
