import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@app/components/v3";
import { TAlarm } from "@app/hooks/api/alarms";

import { AlarmForm } from "./AlarmForm";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId?: string;
  scopeName?: string;
  alarm?: TAlarm;
};

export const AddAlarmModal = ({ isOpen, onOpenChange, projectId, scopeName, alarm }: Props) => {
  const isEditing = Boolean(alarm);

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-2xl">
        <SheetHeader className="border-b">
          <SheetTitle>{isEditing ? "Edit Alarm" : "Add Alarm"}</SheetTitle>
          <SheetDescription>
            Route notifications when a resource event and condition are met.
          </SheetDescription>
        </SheetHeader>
        {isOpen && (
          <AlarmForm
            key={alarm?.id ?? "new"}
            projectId={projectId}
            scopeName={scopeName}
            alarm={alarm}
            onComplete={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
};
