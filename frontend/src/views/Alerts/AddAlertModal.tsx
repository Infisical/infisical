import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@app/components/v3";
import {
  AlertEventType,
  AlertResourceType,
  TAlert,
  TAlertChannelPaywall
} from "@app/hooks/api/alerts";

import { AlertForm } from "./AlertForm";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId?: string;
  resourceType?: AlertResourceType;
  resourceId?: string;
  channelPaywall?: TAlertChannelPaywall;
  alert?: TAlert;
  unavailableEventTypes?: AlertEventType[];
};

export const AddAlertModal = ({
  isOpen,
  onOpenChange,
  projectId,
  resourceType,
  resourceId,
  channelPaywall,
  alert,
  unavailableEventTypes
}: Props) => {
  const isEditing = Boolean(alert);

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>{isEditing ? "Edit Alert" : "Add Alert"}</SheetTitle>
          <SheetDescription className="sr-only">
            Route notifications when a resource event and condition are met.
          </SheetDescription>
        </SheetHeader>
        {isOpen && (
          <AlertForm
            key={alert?.id ?? "new"}
            projectId={projectId}
            resourceType={resourceType}
            resourceId={resourceId}
            channelPaywall={channelPaywall}
            alert={alert}
            unavailableEventTypes={unavailableEventTypes}
            onComplete={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
};
