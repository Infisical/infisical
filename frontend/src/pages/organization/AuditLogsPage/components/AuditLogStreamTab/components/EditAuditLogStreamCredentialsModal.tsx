import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@app/components/v3";
import { TAuditLogStream } from "@app/hooks/api/types";

import { AuditLogStreamForm } from "../AuditLogStreamForm/AuditLogStreamForm";
import { AuditLogStreamHeader } from "./AuditLogStreamHeader";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  auditLogStream?: TAuditLogStream;
};

export const EditAuditLogStreamCredentialsModal = ({
  isOpen,
  onOpenChange,
  auditLogStream
}: Props) => {
  if (!auditLogStream) return null;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-2xl">
        <SheetHeader className="border-b">
          <SheetTitle>
            <AuditLogStreamHeader provider={auditLogStream.provider} logStreamExists />
          </SheetTitle>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <AuditLogStreamForm
            auditLogStream={auditLogStream}
            onComplete={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
};
