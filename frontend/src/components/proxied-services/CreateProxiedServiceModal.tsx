import { useEffect, useState } from "react";
import { AlertTriangleIcon } from "lucide-react";

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
import { ProxiedServiceTemplate } from "@app/helpers/proxiedServiceTemplates";

import { CreateProxiedServiceForm } from "./forms";
import { ProxiedServiceModalHeader } from "./ProxiedServiceModalHeader";
import { ProxiedServiceTemplateSelect } from "./ProxiedServiceTemplateSelect";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
  environment: string;
  secretPath: string;
  existingNames?: string[];
};

// `null` selection = Custom; `undefined` = nothing picked yet (show the template grid).
type Selection = ProxiedServiceTemplate | null | undefined;

export const CreateProxiedServiceModal = ({
  isOpen,
  onOpenChange,
  projectId,
  environment,
  secretPath,
  existingNames = []
}: Props) => {
  const [selection, setSelection] = useState<Selection>(undefined);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) setSelection(undefined);
  }, [isOpen]);

  const isPicking = selection === undefined;

  const close = () => {
    setSelection(undefined);
    onOpenChange(false);
  };

  const handleSheetOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !isPicking) {
      setConfirmDiscardOpen(true);
      return;
    }
    if (!nextOpen) setSelection(undefined);
    onOpenChange(nextOpen);
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={handleSheetOpenChange}>
        <SheetContent className="flex h-full max-h-full w-screen flex-col gap-y-0 sm:max-w-[90vw] xl:max-w-7xl">
          <SheetHeader className="border-b">
            {isPicking ? (
              <>
                <SheetTitle>Choose a template</SheetTitle>
                <SheetDescription>
                  Pick a service to get a head start, or set one up yourself.
                </SheetDescription>
              </>
            ) : (
              <ProxiedServiceModalHeader
                title={selection ? selection.name : "Custom Proxied Service"}
                subtitle="Define how the agent proxy brokers this service."
                image={selection?.image}
              />
            )}
          </SheetHeader>

          {isPicking ? (
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
              <ProxiedServiceTemplateSelect onSelect={setSelection} />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <CreateProxiedServiceForm
                projectId={projectId}
                environment={environment}
                secretPath={secretPath}
                template={selection ?? undefined}
                existingNames={existingNames}
                onComplete={close}
                onBackToTemplates={() => {
                  setConfirmDiscardOpen(false);
                  setSelection(undefined);
                }}
              />
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
            <AlertDialogTitle>Discard setup?</AlertDialogTitle>
            <AlertDialogDescription>
              Your progress configuring this proxied service will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={close}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
