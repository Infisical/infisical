import { createNotification } from "@app/components/notifications";
import { ConfirmationAlertDialog } from "@app/components/v3";
import { TCmek, useDeleteCmek } from "@app/hooks/api/cmeks";

type Props = {
  cmek: TCmek;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onDeleted?: (keyId: string) => void;
};

export const DeleteCmekModal = ({ isOpen, onOpenChange, cmek, onDeleted }: Props) => {
  const deleteCmek = useDeleteCmek();

  if (!cmek) return null;

  const { id: keyId, projectId, name } = cmek;

  const handleDeleteCmek = async () => {
    await deleteCmek.mutateAsync({
      keyId,
      projectId
    });

    createNotification({
      text: "Key successfully deleted",
      type: "success"
    });

    onDeleted?.(keyId);
    onOpenChange(false);
  };

  return (
    <ConfirmationAlertDialog
      isOpen={isOpen}
      title={`Are you sure you want to delete ${name}?`}
      description="This action is irreversible."
      onOpenChange={onOpenChange}
      confirmKey="confirm"
      onConfirm={handleDeleteCmek}
    />
  );
};
