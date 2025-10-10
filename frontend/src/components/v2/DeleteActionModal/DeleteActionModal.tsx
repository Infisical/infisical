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
  deleteKey: string;
  title: string;
  subTitle?: string;
  onDeleteApproved: () => Promise<void>;
  buttonText?: string;
  formContent?: ReactNode;
  children?: ReactNode;
  deletionMessage?: ReactNode;
  buttonColorSchema?: "danger" | "primary" | "secondary" | "gray" | null;
  isDisabled?: boolean;
};

export const DeleteActionModal = ({
  isOpen,
  onClose,
  onChange,
  deleteKey,
  onDeleteApproved,
  title,
  subTitle = "This action is irreversible.",
  buttonText = "Delete",
  formContent,
  deletionMessage,
  buttonColorSchema = "danger",
  isDisabled,
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
      await onDeleteApproved();
    } catch {
      setIsLoading.off();
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
              colorSchema={buttonColorSchema}
              isDisabled={!(deleteKey === inputData) || isLoading || isDisabled}
              onClick={onDelete}
              isLoading={isLoading}
            >
              {buttonText}
            </Button>
            <ModalClose asChild>
              <Button variant="plain" colorSchema="secondary" onClick={onClose}>
                Cancel
              </Button>
            </ModalClose>{" "}
          </div>
        }
        onClose={onClose}
      >
        {formContent}
        <form
          onSubmit={(evt) => {
            evt.preventDefault();
            if (deleteKey === inputData) onDelete();
          }}
        >
          <FormControl
            label={
              <div className="break-words pb-2 text-sm">
                {deletionMessage || (
                  <>
                    Type <span className="font-bold">{deleteKey}</span> to perform this action
                  </>
                )}
              </div>
            }
            className="mb-0"
          >
            <Input
              value={inputData}
              onChange={(e) => setInputData(e.target.value)}
              placeholder={`Type ${deleteKey} here`}
            />
          </FormControl>
          {children}
        </form>
      </ModalContent>
    </Modal>
  );
};
