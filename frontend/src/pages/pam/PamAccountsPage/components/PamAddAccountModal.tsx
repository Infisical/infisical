import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@app/components/v3";
import { PamResourceType, TPamAccount } from "@app/hooks/api/pam";

import { PamAccountForm } from "./PamAccountForm/PamAccountForm";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
  onComplete?: (account: TPamAccount) => void;
  currentFolderId: string | null;
  resource: {
    id: string;
    name: string;
    resourceType: PamResourceType;
  };
};

export const PamAddAccountModal = ({
  isOpen,
  onOpenChange,
  projectId,
  onComplete,
  currentFolderId,
  resource
}: Props) => {
  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange} modal={false}>
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>Create Account</SheetTitle>
          <SheetDescription>Input account connection credentials</SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <PamAccountForm
            closeSheet={(account) => {
              if (account && onComplete) onComplete(account);
              onOpenChange(false);
            }}
            resourceId={resource.id}
            resourceType={resource.resourceType}
            projectId={projectId}
            folderId={currentFolderId ?? undefined}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
};
