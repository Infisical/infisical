import { useState } from "react";
import { ArrowLeftIcon } from "lucide-react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@app/components/v3";
import { LogProvider } from "@app/hooks/api/auditLogStreams/enums";

import { AuditLogStreamForm } from "../AuditLogStreamForm/AuditLogStreamForm";
import { AuditLogStreamHeader } from "./AuditLogStreamHeader";
import { LogStreamProviderSelect } from "./LogStreamProviderSelect";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const AddAuditLogStreamModal = ({ isOpen, onOpenChange }: Props) => {
  const [selectedProvider, setSelectedProvider] = useState<LogProvider | null>(null);

  const closeSheet = () => {
    setSelectedProvider(null);
    onOpenChange(false);
  };

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) setSelectedProvider(null);
        onOpenChange(open);
      }}
    >
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-2xl">
        <SheetHeader className="border-b">
          {selectedProvider ? (
            <>
              <button
                type="button"
                onClick={() => setSelectedProvider(null)}
                className="mb-1 flex w-fit cursor-pointer items-center gap-1 text-xs text-muted transition-colors hover:text-foreground hover:underline"
              >
                <ArrowLeftIcon className="size-3" />
                Select another provider
              </button>
              <SheetTitle>
                <AuditLogStreamHeader provider={selectedProvider} logStreamExists={false} />
              </SheetTitle>
            </>
          ) : (
            <>
              <SheetTitle>Add Log Stream</SheetTitle>
              <SheetDescription asChild>
                <div>
                  Select a log provider or{" "}
                  <button
                    type="button"
                    className="underline underline-offset-2 hover:text-foreground"
                    onClick={() => setSelectedProvider(LogProvider.Custom)}
                  >
                    input a custom URL
                  </button>{" "}
                  to stream logs to.
                </div>
              </SheetDescription>
            </>
          )}
        </SheetHeader>
        {selectedProvider ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <AuditLogStreamForm
              provider={selectedProvider}
              onComplete={closeSheet}
              onCancel={closeSheet}
            />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
            <LogStreamProviderSelect onSelect={setSelectedProvider} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};
