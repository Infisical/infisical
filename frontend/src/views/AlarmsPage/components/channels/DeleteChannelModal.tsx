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
import { TAlarmChannel, useDeleteAlarmChannel } from "@app/hooks/api/alarmChannels";

type Props = {
  channel?: TAlarmChannel;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const DeleteChannelModal = ({ isOpen, onOpenChange, channel }: Props) => {
  const deleteChannel = useDeleteAlarmChannel();

  if (!channel) return null;

  const handleDelete = async () => {
    if (deleteChannel.isPending) return;
    try {
      await deleteChannel.mutateAsync({ channelId: channel.id, projectId: channel.projectId });
      createNotification({
        text: `Successfully deleted channel "${channel.name}"`,
        type: "success"
      });
      onOpenChange(false);
    } catch (err) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Failed to delete channel";
      createNotification({ text: message, type: "error" });
    }
  };

  const usage = channel.usageCount
    ? `This channel is used by ${channel.usageCount} alarm${channel.usageCount === 1 ? "" : "s"}; it will be detached from ${channel.usageCount === 1 ? "it" : "them"}.`
    : "This action is irreversible.";

  return (
    <AlertDialog open={isOpen} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Trash2Icon />
          </AlertDialogMedia>
          <AlertDialogTitle>Are you sure you want to delete {channel.name}?</AlertDialogTitle>
          <AlertDialogDescription>{usage}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button
            variant="danger"
            size="sm"
            isPending={deleteChannel.isPending}
            onClick={handleDelete}
          >
            Delete
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
