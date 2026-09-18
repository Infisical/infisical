import { useState } from "react";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@app/components/v3";
import { formatDateTime, Timezone } from "@app/helpers/datetime";
import { AuditLog } from "@app/hooks/api/auditLogs/types";

import { JsonHighlight } from "./JsonHighlight";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  auditLog?: AuditLog;
  timezone: Timezone;
};

export const AuditLogDetailsSheet = ({ isOpen, onOpenChange, auditLog, timezone }: Props) => {
  // Closing the sheet clears the popup data in the same render `isOpen` flips to false. Retain the
  // last log so its content stays rendered through the Sheet's exit animation rather than the Sheet
  // unmounting instantly and skipping the close transition.
  const [displayedLog, setDisplayedLog] = useState(auditLog);
  if (auditLog && auditLog.id !== displayedLog?.id) {
    setDisplayedLog(auditLog);
  }

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-2xl">
        {displayedLog && (
          <>
            <SheetHeader className="border-b">
              <SheetTitle className="font-mono">{displayedLog.event.type}</SheetTitle>
              <SheetDescription>
                {formatDateTime({ timestamp: displayedLog.createdAt, timezone })}
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 p-4">
              <JsonHighlight value={displayedLog} className="h-full" />
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
