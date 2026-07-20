import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@app/components/v3";
import { TAlert } from "@app/hooks/api/alerts";

import { AlertForm } from "./AlertForm";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId?: string;
  scopeName?: string;
  alert?: TAlert;
};

export const AddAlertModal = ({ isOpen, onOpenChange, projectId, scopeName, alert }: Props) => {
  const isEditing = Boolean(alert);

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-2xl">
        <SheetHeader className="border-b">
          <SheetTitle>{isEditing ? "Edit Alert" : "Add Alert"}</SheetTitle>
          <SheetDescription>
            Route notifications when a resource event and condition are met.
          </SheetDescription>
        </SheetHeader>
        {isOpen && (
          <AlertForm
            key={alert?.id ?? "new"}
            projectId={projectId}
            scopeName={scopeName}
            alert={alert}
            onComplete={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
};
