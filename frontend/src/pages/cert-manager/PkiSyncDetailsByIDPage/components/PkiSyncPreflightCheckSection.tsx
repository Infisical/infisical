import { useState } from "react";

import {
  Badge,
  CodeBlock,
  Detail,
  DetailLabel,
  DetailValue,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { TPkiSync, usePkiSyncOption } from "@app/hooks/api/pkiSyncs";

type Props = {
  pkiSync: TPkiSync;
};

export const PkiSyncPreflightCheckSection = ({ pkiSync }: Props) => {
  const { syncOption } = usePkiSyncOption(pkiSync.destination);
  const { preflightCommand } = pkiSync.syncOptions as { preflightCommand?: string };
  const [isCommandOpen, setIsCommandOpen] = useState(false);

  if (!syncOption?.canRunPreflightCommand) return null;

  return (
    <Detail>
      <DetailLabel>Preflight Check</DetailLabel>
      <DetailValue>
        {preflightCommand ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge asChild variant="neutral">
                <button type="button" onClick={() => setIsCommandOpen(true)}>
                  Configured
                </button>
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="right">Show check</TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-muted/50 italic">None</span>
        )}
      </DetailValue>
      <Dialog open={isCommandOpen} onOpenChange={setIsCommandOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Preflight Check</DialogTitle>
            <DialogDescription>
              Runs on the destination host before this sync delivers anything. A non-zero exit stops
              the sync.
            </DialogDescription>
          </DialogHeader>
          <CodeBlock value={preflightCommand ?? ""} className="max-h-96 whitespace-pre-wrap" />
        </DialogContent>
      </Dialog>
    </Detail>
  );
};
