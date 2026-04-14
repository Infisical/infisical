import { format } from "date-fns";
import { ClockIcon, ShieldIcon } from "lucide-react";

type Props = {
  lastLoginAuthMethod: string;
  lastLoginTime: string;
};

export const LastLoginSection = ({ lastLoginTime, lastLoginAuthMethod }: Props) => (
  <div className="py-1">
    <div className="mb-2 flex items-center gap-2 border-b border-foreground/25 pb-1">
      <div className="font-medium">Last Login</div>
    </div>
    <div className="mb-2 flex items-center gap-2 text-sm">
      <div className="flex items-center justify-center rounded-sm bg-container/50 p-2">
        <ShieldIcon className="size-5" />
      </div>
      <div className="flex flex-col">
        <div className="text-xs font-medium text-label">Authentication Method</div>
        <div className="text-sm">{lastLoginAuthMethod}</div>
      </div>
    </div>
    <div className="flex items-center gap-2 text-sm">
      <div className="flex items-center justify-center rounded-sm bg-container/50 p-2">
        <ClockIcon className="size-5" />
      </div>
      <div className="flex flex-col">
        <div className="text-xs font-medium text-label">Time</div>
        <div className="text-sm">{format(lastLoginTime, "PPpp")} </div>
      </div>
    </div>
  </div>
);
