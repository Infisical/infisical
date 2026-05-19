import { format } from "date-fns";
import { ClockIcon, MessageSquareWarningIcon } from "lucide-react";

type Props = {
  lastErrorMessage: string | null;
  lastErrorTimestamp: string | null;
};

export const LastErrorSection = ({ lastErrorMessage, lastErrorTimestamp }: Props) => (
  <div className="py-1">
    <div className="mb-2 flex items-center gap-2 border-b border-foreground/25 pb-1">
      <div className="font-medium">Last Error</div>
    </div>
    {lastErrorMessage && (
      <div className="mb-2 flex items-start gap-2 text-sm">
        <div className="flex items-center justify-center rounded-sm bg-container/50 p-2">
          <MessageSquareWarningIcon className="size-5" />
        </div>
        <div className="flex flex-col">
          <div className="text-xs font-medium text-label">Message</div>
          <div className="text-sm break-words">{lastErrorMessage}</div>
        </div>
      </div>
    )}
    {lastErrorTimestamp && (
      <div className="flex items-center gap-2 text-sm">
        <div className="flex items-center justify-center rounded-sm bg-container/50 p-2">
          <ClockIcon className="size-5" />
        </div>
        <div className="flex flex-col">
          <div className="text-xs font-medium text-label">Time</div>
          <div className="text-sm">{format(lastErrorTimestamp, "PPpp")}</div>
        </div>
      </div>
    )}
  </div>
);
