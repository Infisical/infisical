import { faCheck, faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { IconButton, Modal, ModalContent, Tooltip } from "@app/components/v2";
import { useTimedReset } from "@app/hooks";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  popUp: UsePopUpState<["tokenAuthToken"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["tokenAuthToken"]>, state?: boolean) => void;
};

export const IdentityTokenAuthTokenModal = ({ popUp, handlePopUpToggle }: Props) => {
  const [copyTextAccessToken, isCopyingAccessToken, setCopyTextAccessToken] = useTimedReset<string>(
    {
      initialState: "Copy to clipboard"
    }
  );

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
          <div className="mb-8 flex items-center justify-between rounded-md bg-white/[0.07] p-2 text-base text-gray-400">
            <p className="mr-4 break-all">{popUpData.accessToken}</p>
            <Tooltip content={copyTextAccessToken}>
              <IconButton
                ariaLabel="copy icon"
                colorSchema="secondary"
                className="group relative"
                onClick={() => {
                  navigator.clipboard.writeText(popUpData.accessToken);
                  setCopyTextAccessToken("Copied");
                }}
              >
                <FontAwesomeIcon icon={isCopyingAccessToken ? faCheck : faCopy} />
              </IconButton>
            </Tooltip>
          </div>
        )}
      </ModalContent>
    </Modal>
  );
};
