import { ClipboardCheck, Copy } from "lucide-react";

import { Modal, ModalContent } from "@app/components/v2";
import { ButtonGroup, IconButton, Input } from "@app/components/v3";
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
    <Modal
      isOpen={popUp?.tokenAuthToken?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("tokenAuthToken", isOpen);
      }}
    >
      <ModalContent title="Access Token">
        {popUpData?.accessToken && (
          <ButtonGroup className="mb-8 w-full">
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
      </ModalContent>
    </Modal>
  );
};
