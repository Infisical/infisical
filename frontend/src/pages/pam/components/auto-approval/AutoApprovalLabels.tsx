import { ReactElement, ReactNode } from "react";

import { ProviderIcon, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";

export const ConnectionIcon = ({ app, className }: { app: string; className?: string }) => {
  const details = APP_CONNECTION_MAP[app as AppConnection];
  if (!details) return null;
  return <ProviderIcon icon={details.image} alt="" className={cn("size-4 shrink-0", className)} />;
};

export const SectionLabel = ({ children }: { children: ReactNode }) => (
  <p className="text-xs font-medium tracking-wider text-muted uppercase">{children}</p>
);

// A disabled button gets no pointer events, so the tooltip hangs off a wrapper
export const DisabledReason = ({
  reason,
  children
}: {
  reason?: string;
  children: ReactElement;
}) => {
  if (!reason) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex shrink-0">{children}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{reason}</TooltipContent>
    </Tooltip>
  );
};

export const LogicConnector = ({ label }: { label: string }) => (
  <div className="flex py-1.5 pl-4">
    <span className="rounded-sm border border-border bg-foreground/5 px-1 py-0.5 text-[9px] leading-none font-medium tracking-wider text-muted uppercase">
      {label}
    </span>
  </div>
);
