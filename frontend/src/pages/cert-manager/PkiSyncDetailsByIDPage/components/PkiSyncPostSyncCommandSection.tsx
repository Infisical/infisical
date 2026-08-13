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

export const PkiSyncPostSyncCommandSection = ({ pkiSync }: Props) => {
  const { syncOption } = usePkiSyncOption(pkiSync.destination);
  const { postSyncCommand } = pkiSync.syncOptions as { postSyncCommand?: string };
  const [isCommandOpen, setIsCommandOpen] = useState(false);

  if (!syncOption?.canRunPostSyncCommand) return null;

  return (
    <Detail>
      <DetailLabel>Post-Sync Command</DetailLabel>
      <DetailValue>
        {postSyncCommand ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge asChild variant="neutral">
                <button type="button" onClick={() => setIsCommandOpen(true)}>
                  Configured
                </button>
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="right">Show command</TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-muted/50 italic">None</span>
        )}
      </DetailValue>
      <Dialog open={isCommandOpen} onOpenChange={setIsCommandOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Post-Sync Command</DialogTitle>
            <DialogDescription>
              Runs on the destination host after this sync delivers a certificate.
            </DialogDescription>
          </DialogHeader>
          <CodeBlock value={postSyncCommand ?? ""} className="max-h-96 whitespace-pre-wrap" />
        </DialogContent>
      </Dialog>
    </Detail>
  );
};
