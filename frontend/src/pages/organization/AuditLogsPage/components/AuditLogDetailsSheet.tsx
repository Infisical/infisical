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
  if (!auditLog) return null;

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-2xl">
        <SheetHeader className="border-b">
          <SheetTitle className="font-mono">{auditLog.event.type}</SheetTitle>
          <SheetDescription>
            {formatDateTime({ timestamp: auditLog.createdAt, timezone })}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 p-4">
          <JsonHighlight value={auditLog} className="h-full" />
        </div>
      </SheetContent>
    </Sheet>
  );
};
