import { useEffect, useState } from "react";

import { useToggle } from "@app/hooks";

import { Button } from "../Button";
import { FormControl } from "../FormControl";
import { Input } from "../Input";
import { Modal, ModalClose, ModalContent } from "../Modal";

type Props = {
  deleteKey: string;
  title: string;
  onLeaveApproved: () => Promise<void>;
  onClose?: () => void;
  onChange?: (isOpen: boolean) => void;
  isOpen?: boolean;
  subTitle?: string;
  buttonText?: string;
};

export const LeaveProjectModal = ({
  isOpen,
  onClose,
  onChange,
  deleteKey,
  onLeaveApproved,
  title,
  subTitle,
  buttonText = "Leave Project"
}: Props): JSX.Element => {
  const [inputData, setInputData] = useState("");
  const [isLoading, setIsLoading] = useToggle();

  useEffect(() => {
    setInputData("");
  }, [isOpen]);

  const onDelete = async () => {
    setIsLoading.on();
    try {
      await onLeaveApproved();
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
              colorSchema="danger"
              isDisabled={!(deleteKey === inputData) || isLoading}
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
        <form
          onSubmit={(evt) => {
            evt.preventDefault();
            if (deleteKey === inputData) onDelete();
          }}
        >
          <FormControl
            label={
              <div className="break-words pb-2 text-sm">
                Type <span className="font-bold">{deleteKey}</span> to leave the project
              </div>
            }
            className="mb-0"
          >
            <Input
              value={inputData}
              onChange={(e) => setInputData(e.target.value)}
              placeholder="Type to confirm..."
            />
          </FormControl>
        </form>
      </ModalContent>
    </Modal>
  );
};
