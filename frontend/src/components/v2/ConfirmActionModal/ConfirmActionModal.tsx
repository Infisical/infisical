import { ReactNode, useEffect, useState } from "react";

import { useToggle } from "@app/hooks";

import { Button } from "../Button";
import { FormControl } from "../FormControl";
import { Input } from "../Input";
import { Modal, ModalClose, ModalContent } from "../Modal";

type Props = {
  isOpen?: boolean;
  onClose?: () => void;
  onChange?: (isOpen: boolean) => void;
  confirmKey: string;
  title: string;
  subTitle?: string;
  onConfirmed: () => Promise<void>;
  buttonText?: string;
  formContent?: ReactNode;
  children?: ReactNode;
  confirmationMessage?: ReactNode;
};

export const ConfirmActionModal = ({
  isOpen,
  onClose,
  onChange,
  confirmKey,
  onConfirmed,
  title,
  subTitle = "This action is irreversible.",
  buttonText = "Yes",
  formContent,
  confirmationMessage,
  children
}: Props): JSX.Element => {
  const [inputData, setInputData] = useState("");
  const [isLoading, setIsLoading] = useToggle();

  useEffect(() => {
    setInputData("");
  }, [isOpen]);

  const onDelete = async () => {
    setIsLoading.on();
    try {
      await onConfirmed();
    } finally {
      setIsLoading.off();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(isOpenState) => {
        setInputData("");
        if (onChange) onChange(isOpenState);
      }}
    >
      <ModalContent
        title={title}
        subTitle={subTitle}
        footerContent={
          <div className="mx-2 flex items-center">
            <Button
              className="mr-4"
              isDisabled={!(confirmKey === inputData) || isLoading}
              onClick={onDelete}
              isLoading={isLoading}
            >
              {buttonText}
            </Button>
            <ModalClose asChild>
              <Button variant="plain" colorSchema="secondary" onClick={onClose}>
                Cancel
              </Button>
            </ModalClose>
          </div>
        }
        onClose={onClose}
      >
        {formContent}
        <form
          onSubmit={(evt) => {
            evt.preventDefault();
            if (confirmKey === inputData) onDelete();
          }}
        >
          <FormControl
            label={
              <div className="break-words pb-2 text-sm">
                {confirmationMessage || (
                  <>
                    Type <span className="font-bold">{confirmKey}</span> to perform this action
                  </>
                )}
              </div>
            }
            className="mb-0"
          >
            <Input
              value={inputData}
              onChange={(e) => setInputData(e.target.value)}
              placeholder={`Type ${confirmKey} here`}
            />
          </FormControl>
          {children}
        </form>
      </ModalContent>
    </Modal>
  );
};
