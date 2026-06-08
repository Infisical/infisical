import { Check, Copy } from "lucide-react";

import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  IconButton
} from "@app/components/v3";
import { useTimedReset } from "@app/hooks";
import { UsePopUpState } from "@app/hooks/usePopUp";

export type TOauthClientSecretData = {
  clientName: string;
  clientId: string;
  clientSecret: string;
};

type Props = {
  popUp: UsePopUpState<["clientSecret"]>;
  handlePopUpClose: (popUpName: keyof UsePopUpState<["clientSecret"]>) => void;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["clientSecret"]>, state?: boolean) => void;
};

const CopyableValue = ({ label, value }: { label: string; value: string }) => {
  const [, isCopying, setCopyText] = useTimedReset<string>({
    initialState: "Copy to clipboard"
  });

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-accent">{label}</span>
      <div className="flex items-center gap-2 rounded-md border border-border bg-container p-2">
        <p className="grow font-mono text-sm break-all text-foreground">{value}</p>
        <IconButton
          variant="ghost"
          size="xs"
          aria-label={`Copy ${label}`}
          onClick={() => {
            navigator.clipboard.writeText(value);
            setCopyText("Copied");
          }}
        >
          {isCopying ? <Check /> : <Copy />}
        </IconButton>
      </div>
    </div>
  );
};

export const OauthClientSecretModal = ({ popUp, handlePopUpClose, handlePopUpToggle }: Props) => {
  const data = popUp?.clientSecret?.data as TOauthClientSecretData | undefined;

  return (
    <Dialog
      open={popUp?.clientSecret?.isOpen}
      onOpenChange={(isOpen) => handlePopUpToggle("clientSecret", isOpen)}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>OAuth client credentials</DialogTitle>
          <DialogDescription>
            Use these credentials to register {data?.clientName || "this application"} as an OAuth
            provider on the external platform.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Alert variant="warning">
            <AlertDescription>
              The client secret is only shown once. Store it securely — you will not be able to
              retrieve it again, only rotate it.
            </AlertDescription>
          </Alert>
          <CopyableValue label="Client ID" value={data?.clientId ?? ""} />
          <CopyableValue label="Client Secret" value={data?.clientSecret ?? ""} />
        </div>
        <DialogFooter>
          <Button variant="org" type="button" onClick={() => handlePopUpClose("clientSecret")}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
