import { ClipboardCheck, Copy } from "lucide-react";

import {
  ButtonGroup,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  IconButton,
  Input
} from "@app/components/v3";
import { useTimedReset } from "@app/hooks";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  popUp: UsePopUpState<["tokenAuthToken"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["tokenAuthToken"]>, state?: boolean) => void;
};

export const IdentityTokenAuthTokenModal = ({ popUp, handlePopUpToggle }: Props) => {
  const [, isCopyingAccessToken, setCopyTextAccessToken] = useTimedReset<string>({
    initialState: "Copy to clipboard"
  });

  const popUpData = popUp?.tokenAuthToken?.data as {
    accessToken: string;
  };

  return (
    <Dialog
      open={popUp?.tokenAuthToken?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("tokenAuthToken", isOpen);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Access Token</DialogTitle>
        </DialogHeader>
        {popUpData?.accessToken && (
          <ButtonGroup className="w-full">
            <Input
              value={popUpData.accessToken}
              readOnly
              aria-label="Access token"
              className="font-mono"
            />
            <IconButton
              variant="outline"
              aria-label="Copy to clipboard"
              onClick={() => {
                navigator.clipboard.writeText(popUpData.accessToken);
                setCopyTextAccessToken("Copied");
              }}
            >
              {isCopyingAccessToken ? <ClipboardCheck /> : <Copy />}
            </IconButton>
          </ButtonGroup>
        )}
      </DialogContent>
    </Dialog>
  );
};
