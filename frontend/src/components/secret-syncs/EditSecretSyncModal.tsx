import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@app/components/v3";
import { TSecretSync } from "@app/hooks/api/secretSyncs";

import { EditSecretSyncForm } from "./forms";
import { SecretSyncModalHeader } from "./SecretSyncModalHeader";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  secretSync?: TSecretSync;
};

export const EditSecretSyncModal = ({ isOpen, secretSync, onOpenChange }: Props) => {
  if (!secretSync) return null;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-[1500px]">
        <SheetHeader className="border-b">
          <SheetTitle>
            <SecretSyncModalHeader isConfigured destination={secretSync.destination} />
          </SheetTitle>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col">
          <EditSecretSyncForm secretSync={secretSync} onComplete={() => onOpenChange(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
};
