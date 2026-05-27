import { useState } from "react";
import { format } from "date-fns";
import { AlertTriangleIcon, CheckIcon, CopyIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useTimedReset } from "@app/hooks";

type Props = {
  lastErrorMessage: string | null;
  lastErrorTimestamp: string | null;
};

export const LastErrorDialog = ({ lastErrorMessage, lastErrorTimestamp }: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const [, isCopied, setCopied] = useTimedReset<string>({ initialState: "" });

  const handleCopy = async () => {
    if (!lastErrorMessage) return;
    await navigator.clipboard.writeText(lastErrorMessage);
    setCopied("copied");
    createNotification({ type: "success", text: "Error message copied to clipboard" });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="View last error"
            onClick={() => setIsOpen(true)}
            className="flex shrink-0 cursor-pointer items-center rounded-sm p-0.5 text-yellow-500 outline-none hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <AlertTriangleIcon className="size-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent>Click to view error</TooltipContent>
      </Tooltip>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangleIcon className="size-5 text-yellow-500" />
            Last Error
          </DialogTitle>
          {lastErrorTimestamp && (
            <p className="text-xs text-accent">{format(lastErrorTimestamp, "PPpp")}</p>
          )}
        </DialogHeader>
        {lastErrorMessage ? (
          <pre className="max-h-80 overflow-auto rounded-md border border-border bg-container/50 p-3 font-mono text-xs whitespace-pre-wrap text-foreground select-all">
            {lastErrorMessage}
          </pre>
        ) : (
          <p className="text-sm text-accent">No error message available.</p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Close</Button>
          </DialogClose>
          {lastErrorMessage && (
            <Button variant="neutral" onClick={handleCopy}>
              {isCopied ? <CheckIcon /> : <CopyIcon />}
              {isCopied ? "Copied" : "Copy"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
