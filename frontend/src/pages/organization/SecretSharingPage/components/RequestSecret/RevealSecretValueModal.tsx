import { Check, Copy } from "lucide-react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v3";
import { useTimedReset } from "@app/hooks";
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
  const [, isSecretValueCopied, setCopyText] = useTimedReset<string>({
    initialState: "Copy to clipboard"
  });

  return (
    <>
      <div className="rounded-md border border-border bg-container p-3 text-base text-label">
        <p className="max-h-128 thin-scrollbar min-w-0 overflow-y-auto font-mono break-all whitespace-pre-wrap">
          {secretValue}
        </p>
      </div>

      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
        <Button
          variant="project"
          onClick={async () => {
            await navigator.clipboard.writeText(secretValue);
            setCopyText("Copied");
          }}
        >
          {isSecretValueCopied ? <Check /> : <Copy />}
          {isSecretValueCopied ? "Copied" : "Copy Value"}
        </Button>
      </DialogFooter>
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
          <DialogTitle>Requested Secret Value</DialogTitle>
          <DialogDescription>
            {data?.secretRequestName
              ? `Submitted for ${data.secretRequestName}.`
              : "Submitted through your secret request."}
          </DialogDescription>
        </DialogHeader>
        <Content secretValue={data?.secretValue} onClose={() => onOpenChange?.(false)} />
      </DialogContent>
    </Dialog>
  );
};
