import { Trash2Icon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  Button
} from "@app/components/v3";
import { TAlert, useDeleteAlert } from "@app/hooks/api/alerts";

type Props = {
  alert?: TAlert;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const DeleteAlertModal = ({ isOpen, onOpenChange, alert }: Props) => {
  const deleteAlert = useDeleteAlert();

  if (!alert) return null;

  const handleDelete = async () => {
    if (deleteAlert.isPending) return;
    try {
      await deleteAlert.mutateAsync({ alertId: alert.id, projectId: alert.projectId });
      createNotification({ text: `Successfully deleted alert "${alert.name}"`, type: "success" });
      onOpenChange(false);
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Failed to delete alert";
      createNotification({ text: message, type: "error" });
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Trash2Icon />
          </AlertDialogMedia>
          <AlertDialogTitle>Are you sure you want to delete {alert.name}?</AlertDialogTitle>
          <AlertDialogDescription>This action is irreversible.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            variant="danger"
            size="sm"
            isPending={deleteAlert.isPending}
            onClick={handleDelete}
          >
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
