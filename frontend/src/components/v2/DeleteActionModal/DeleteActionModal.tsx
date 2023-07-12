import { useEffect, useState } from "react";

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
  onDeleteApproved: () => Promise<void>;
};

export const DeleteActionModal = ({
  isOpen,
  onClose,
  onChange,
  deleteKey,
  onDeleteApproved,
  title
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
        subTitle="This action is irreversible!"
        footerContent={
          <div className="flex items-center">
            <Button
              className="mr-4"
              colorSchema="danger"
              isDisabled={!(deleteKey === inputData) || isLoading}
              onClick={onDelete}
              isLoading={isLoading}
            >
              Delete
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
                Type <span className="font-bold">{deleteKey}</span> to delete the resource
              </div>
            }
            className="mb-4"
          >
            <Input value={inputData} onChange={(e) => setInputData(e.target.value)} />
          </FormControl>
        </form>
      </ModalContent>
    </Modal>
  );
};
