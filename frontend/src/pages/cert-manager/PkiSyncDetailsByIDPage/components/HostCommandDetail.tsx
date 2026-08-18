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

type Props = {
  label: string;
  command?: string;
  showCommandLabel: string;
  dialogDescription: string;
};

export const HostCommandDetail = ({
  label,
  command,
  showCommandLabel,
  dialogDescription
}: Props) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Detail>
      <DetailLabel>{label}</DetailLabel>
      <DetailValue>
        {command ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge asChild variant="neutral">
                <button type="button" onClick={() => setIsOpen(true)}>
                  Configured
                </button>
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="right">{showCommandLabel}</TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-muted/50 italic">None</span>
        )}
      </DetailValue>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>{dialogDescription}</DialogDescription>
          </DialogHeader>
          <CodeBlock value={command ?? ""} className="max-h-96 whitespace-pre-wrap" />
        </DialogContent>
      </Dialog>
    </Detail>
  );
};
