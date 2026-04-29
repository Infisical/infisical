import { ClipboardCheckIcon, Copy } from "lucide-react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  IconButton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useToggle } from "@app/hooks";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  isOpen: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  popUp: UsePopUpState<["revealSecretRequestValue"]>;
};

type ContentProps = {
  secretValue: string;
  onClose: () => void;
};

const Content = ({ secretValue, onClose }: ContentProps) => {
  const [isSecretValueCopied, setIsSecretValueCopied] = useToggle(false);

  return (
    <>
      <div className="relative flex items-center justify-between rounded-md border border-border bg-container p-2 pr-5 pl-3 text-base text-label">
        <p className="mr-4 break-all">{secretValue}</p>
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton
              aria-label="copy icon"
              variant="ghost"
              size="sm"
              className="absolute top-1 right-1"
              onClick={() => {
                navigator.clipboard.writeText(secretValue);
                setIsSecretValueCopied.on();
              }}
            >
              {isSecretValueCopied ? (
                <ClipboardCheckIcon className="size-4" />
              ) : (
                <Copy className="size-4" />
              )}
            </IconButton>
          </TooltipTrigger>
          <TooltipContent>Click to copy</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex w-full justify-end">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
    </>
  );
};

export const RevealSecretValueModal = ({ isOpen, onOpenChange, popUp }: Props) => {
  const data = popUp.revealSecretRequestValue.data as {
    secretValue: string;
    secretRequestName?: string;
  };
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Shared secret value</DialogTitle>
          {data?.secretRequestName && (
            <DialogDescription>
              Shared secret value for secret request {data.secretRequestName}
            </DialogDescription>
          )}
        </DialogHeader>
        <Content secretValue={data?.secretValue} onClose={() => onOpenChange?.(false)} />
      </DialogContent>
    </Dialog>
  );
};
