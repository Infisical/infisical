import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@app/components/v3";
import { TAlertChannel } from "@app/hooks/api/alertChannels";

import { ChannelForm } from "./ChannelForm";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId?: string;
  channel?: TAlertChannel;
  onCreated?: (channelId: string) => void;
};

export const AddChannelModal = ({ isOpen, onOpenChange, projectId, channel, onCreated }: Props) => {
  const isEditing = Boolean(channel);

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-xl">
        <SheetHeader className="border-b">
          <SheetTitle>{isEditing ? "Edit Channel" : "Add Channel"}</SheetTitle>
          <SheetDescription>A delivery destination that any alert can reference.</SheetDescription>
        </SheetHeader>
        {isOpen && (
          <ChannelForm
            key={channel?.id ?? "new"}
            projectId={projectId}
            channel={channel}
            onComplete={(channelId) => {
              onCreated?.(channelId);
              onOpenChange(false);
            }}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
};
