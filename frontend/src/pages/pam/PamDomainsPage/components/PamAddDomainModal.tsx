import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@app/components/v3";
import { PamResourceType, TPamResource } from "@app/hooks/api/pam";

import { PamResourceForm } from "../../PamResourcesPage/components/PamResourceForm";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
  onComplete?: (resource: TPamResource) => void;
};

export const PamAddDomainModal = ({ isOpen, onOpenChange, projectId, onComplete }: Props) => {
  const handleClose = (resource?: TPamResource) => {
    if (resource && onComplete) onComplete(resource);
    onOpenChange(false);
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>Create Domain</SheetTitle>
          <SheetDescription>Input Active Directory domain connection details</SheetDescription>
        </SheetHeader>
        <PamResourceForm
          closeSheet={handleClose}
          resourceType={PamResourceType.ActiveDirectory}
          projectId={projectId}
        />
      </SheetContent>
    </Sheet>
  );
};
