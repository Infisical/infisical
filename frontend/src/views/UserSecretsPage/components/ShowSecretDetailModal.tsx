import { faCheck, faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { IconButton, Modal, ModalContent } from "@app/components/v2";
import { useTimedReset } from "@app/hooks";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  popUp: UsePopUpState<["showSecretData"]>;
  handlePopUpClose: (popUpName: keyof UsePopUpState<["showSecretData"]>) => void;
};

export const ShowSecretDetailModal = ({ popUp, handlePopUpClose }: Props) => {
  const [, isCopyingSecret, setCopyTextSecret] = useTimedReset<string>({
    initialState: "Copy to clipboard"
  });

  const keyName = popUp.showSecretData?.data?.keyName;
  const value = popUp.showSecretData?.data?.value;

  return (
    <Modal
      isOpen={popUp?.showSecretData?.isOpen}
      onOpenChange={() => {
        handlePopUpClose("showSecretData");
      }}
    >
      <ModalContent title={keyName}>
        <div className="mr-2 flex items-center justify-start rounded-md bg-white/[0.05] p-2 text-base text-gray-400">
          <p className="mr-4 flex-1 break-all">{value}</p>
          <IconButton
            ariaLabel="copy icon"
            colorSchema="secondary"
            className="group relative ml-2"
            onClick={() => {
              navigator.clipboard.writeText(value);
              setCopyTextSecret("Copied");
            }}
          >
            <FontAwesomeIcon icon={isCopyingSecret ? faCheck : faCopy} />
          </IconButton>
        </div>
      </ModalContent>
    </Modal>
  );
};
