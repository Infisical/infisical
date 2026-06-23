import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@app/components/v3";
import { TAppConnection } from "@app/hooks/api/appConnections";

import { AppConnectionForm } from "./AppConnectionForm";
import { AppConnectionHeader } from "./AppConnectionHeader";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  appConnection?: TAppConnection;
};

export const EditAppConnectionCredentialsModal = ({
  isOpen,
  onOpenChange,
  appConnection
}: Props) => {
  if (!appConnection) return null;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-2xl">
        <SheetHeader className="border-b">
          <SheetTitle>
            <AppConnectionHeader app={appConnection.app} isConnected />
          </SheetTitle>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <AppConnectionForm
            appConnection={appConnection}
            onComplete={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
};
