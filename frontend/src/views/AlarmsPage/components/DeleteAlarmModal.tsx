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
import { TAlarm, useDeleteAlarm } from "@app/hooks/api/alarms";

type Props = {
  alarm?: TAlarm;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const DeleteAlarmModal = ({ isOpen, onOpenChange, alarm }: Props) => {
  const deleteAlarm = useDeleteAlarm();

  if (!alarm) return null;

  const handleDelete = async () => {
    if (deleteAlarm.isPending) return;
    try {
      await deleteAlarm.mutateAsync({ alarmId: alarm.id, projectId: alarm.projectId });
      createNotification({ text: `Successfully deleted alarm "${alarm.name}"`, type: "success" });
      onOpenChange(false);
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Failed to delete alarm";
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
          <AlertDialogTitle>Are you sure you want to delete {alarm.name}?</AlertDialogTitle>
          <AlertDialogDescription>This action is irreversible.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            variant="danger"
            size="sm"
            isPending={deleteAlarm.isPending}
            onClick={handleDelete}
          >
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
