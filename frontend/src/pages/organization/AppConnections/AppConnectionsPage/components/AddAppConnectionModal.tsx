import { useEffect, useState } from "react";
import { AlertTriangleIcon, ArrowLeftIcon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { TAppConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { ProjectType } from "@app/hooks/api/projects/types";

import { AppConnectionForm } from "./AppConnectionForm";
import { AppConnectionHeader } from "./AppConnectionHeader";
import { AppConnectionsSelect } from "./AppConnectionList";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId?: string;
  projectType?: ProjectType;
  app?: AppConnection;
  onComplete?: (appConnection: TAppConnection) => void;
};

export const AddAppConnectionModal = ({
  isOpen,
  onOpenChange,
  projectId,
  projectType,
  app,
  onComplete
}: Props) => {
  // When `app` is preset (inline create from another flow, or an OAuth reopen) we skip the provider
  // select screen and go straight to that app's form. Otherwise the user picks a provider first.
  const [selectedApp, setSelectedApp] = useState<AppConnection | null>(app ?? null);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  // Reset to the starting step whenever the sheet (re)opens: a preset `app` goes straight to its
  // form, otherwise the provider picker. Keyed on `isOpen` so reopening with an unchanged preset
  // `app` (inline create flows keep the modal mounted) still restores the form instead of falling
  // back to the picker.
  useEffect(() => {
    if (isOpen) setSelectedApp(app ?? null);
  }, [isOpen, app]);

  const closeSheet = () => {
    setSelectedApp(null);
    onOpenChange(false);
  };

  const handleComplete = (appConnection: TAppConnection) => {
    onComplete?.(appConnection);
    closeSheet();
  };

  const handleSheetOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && selectedApp) {
      // User has started configuring a connection — confirm before discarding.
      setConfirmDiscardOpen(true);
      return;
    }
    if (!nextOpen) setSelectedApp(null);
    onOpenChange(nextOpen);
  };

  // Only offer "back to select" when the user navigated here from the select screen (no preset app).
  const showBack = !app && Boolean(selectedApp);

  return (
    <>
      <Sheet open={isOpen} onOpenChange={handleSheetOpenChange}>
        <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-2xl">
          <SheetHeader className="border-b">
            {selectedApp ? (
              <>
                {showBack && (
                  <button
                    type="button"
                    onClick={() => setSelectedApp(null)}
                    className="mb-1 flex w-fit cursor-pointer items-center gap-1 text-xs text-muted transition-colors hover:text-foreground hover:underline"
                  >
                    <ArrowLeftIcon className="size-3" />
                    Select Another App
                  </button>
                )}
                <SheetTitle>
                  <AppConnectionHeader app={selectedApp} isConnected={false} />
                </SheetTitle>
              </>
            ) : (
              <>
                <SheetTitle>Add Connection</SheetTitle>
                <SheetDescription>Select a third-party app to connect to.</SheetDescription>
              </>
            )}
          </SheetHeader>
          {selectedApp ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <AppConnectionForm
                app={selectedApp}
                projectId={projectId}
                onComplete={handleComplete}
                // Explicit Cancel is a deliberate abandon, so it closes immediately. Ambiguous
                // dismissals (X / Escape / outside click) route through handleSheetOpenChange,
                // which shows the discard confirmation.
                onCancel={closeSheet}
              />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
              <AppConnectionsSelect onSelect={setSelectedApp} projectType={projectType} />
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmDiscardOpen} onOpenChange={setConfirmDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <AlertTriangleIcon />
            </AlertDialogMedia>
            <AlertDialogTitle>Discard connection setup?</AlertDialogTitle>
            <AlertDialogDescription>
              Your progress configuring this connection will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={closeSheet}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
