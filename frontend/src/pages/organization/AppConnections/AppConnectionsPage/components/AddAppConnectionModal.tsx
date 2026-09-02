import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeftIcon } from "lucide-react";

import {
  DiscardChangesAlertDialog,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { useDiscardChangesGuard } from "@app/hooks";
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
  const [isDirty, setIsDirty] = useState(false);
  const discardActionRef = useRef<VoidFunction>(() => {});

  // Reset to the starting step whenever the sheet (re)opens: a preset `app` goes straight to its
  // form, otherwise the provider picker. Keyed on `isOpen` so reopening with an unchanged preset
  // `app` (inline create flows keep the modal mounted) still restores the form instead of falling
  // back to the picker.
  useEffect(() => {
    if (isOpen) {
      setSelectedApp(app ?? null);
      setIsDirty(false);
    }
  }, [isOpen, app]);

  const closeSheet = useCallback(() => {
    setIsDirty(false);
    setSelectedApp(null);
    onOpenChange(false);
  }, [onOpenChange]);

  const returnToAppSelect = useCallback(() => {
    setIsDirty(false);
    setSelectedApp(null);
  }, []);

  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({
      isDirty,
      onDiscard: () => discardActionRef.current()
    });

  const requestDiscardAction = (action: VoidFunction) => {
    discardActionRef.current = action;
    requestDiscard();
  };

  const handleComplete = (appConnection: TAppConnection) => {
    onComplete?.(appConnection);
    closeSheet();
  };

  const handleSheetOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      requestDiscardAction(closeSheet);
      return;
    }
    onOpenChange(true);
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
                    onClick={() => requestDiscardAction(returnToAppSelect)}
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
                onCancel={() => requestDiscardAction(closeSheet)}
                onDirtyChange={setIsDirty}
              />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
              <AppConnectionsSelect
                onSelect={(nextApp) => {
                  setIsDirty(false);
                  setSelectedApp(nextApp);
                }}
                projectType={projectType}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>

      <DiscardChangesAlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={setIsDiscardDialogOpen}
        onDiscard={confirmDiscard}
        title="Discard Connection Setup?"
        description="Your progress configuring this connection will be lost."
      />
    </>
  );
};
