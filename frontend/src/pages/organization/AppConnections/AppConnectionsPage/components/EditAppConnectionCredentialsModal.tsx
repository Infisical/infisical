import { useState } from "react";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@app/components/v3";
import { TAppConnection } from "@app/hooks/api/appConnections";

import { AppConnectionForm } from "./AppConnectionForm";
import { AppConnectionHeader } from "./AppConnectionHeader";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  appConnection?: TAppConnection;
  preselectedUseCases?: string[];
};

export const EditAppConnectionCredentialsModal = ({
  isOpen,
  onOpenChange,
  appConnection,
  preselectedUseCases
}: Props) => {
  const [isPending, setIsPending] = useState(false);

  if (!appConnection) return null;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        isPending={isPending}
        className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-2xl"
      >
        <SheetHeader className="border-b">
          <SheetTitle>
            <AppConnectionHeader app={appConnection.app} isConnected />
          </SheetTitle>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <AppConnectionForm
            appConnection={appConnection}
            preselectedUseCases={preselectedUseCases}
            onPendingChange={setIsPending}
            onComplete={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
};
