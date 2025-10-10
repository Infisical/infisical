import { faCheck, faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button, IconButton, Modal, ModalClose, ModalContent, Tooltip } from "@app/components/v2";
import { useToggle } from "@app/hooks";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  isOpen: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  popUp: UsePopUpState<["revealSecretRequestValue"]>;
};

type ContentProps = {
  secretValue: string;
  secretRequestName?: string;
};

const Content = ({ secretValue, secretRequestName }: ContentProps) => {
  const [isSecretValueCopied, setIsSecretValueCopied] = useToggle(false);

  return (
    <>
      {secretRequestName && (
        <p className="mb-8 text-sm text-mineshaft-200">
          Shared secret value for <strong>{secretRequestName}</strong>
        </p>
      )}

      <div className="mb-8 flex items-center justify-between rounded-md bg-mineshaft-700 p-2 text-base text-gray-400">
        <p className="mr-4 break-all">{secretValue}</p>
        <Tooltip content="Click to copy">
          <IconButton
            ariaLabel="copy icon"
            colorSchema="secondary"
            className="group relative"
            onClick={() => {
              navigator.clipboard.writeText(secretValue);
              setIsSecretValueCopied.on();
            }}
          >
            <FontAwesomeIcon icon={isSecretValueCopied ? faCheck : faCopy} />
          </IconButton>
        </Tooltip>
      </div>

      <div className="mt-8 flex w-full items-center justify-between gap-2">
        <ModalClose asChild>
          <Button colorSchema="secondary">Close</Button>
        </ModalClose>
      </div>
    </>
  );
};

export const RevealSecretValueModal = ({ isOpen, onOpenChange, popUp }: Props) => {
  const data = popUp.revealSecretRequestValue.data as {
    secretValue: string;
    secretRequestName?: string;
  };

  const title = data?.secretRequestName
    ? `Shared secret value for secret request ${data.secretRequestName}`
    : "Shared secret value";

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent title={title}>
        <Content secretRequestName={data?.secretRequestName} secretValue={data?.secretValue} />
      </ModalContent>
    </Modal>
  );
};
