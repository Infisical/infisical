import { useEffect, useState } from "react";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldContent,
  FieldLabel,
  UnstableInput
} from "@app/components/v3";
import { useToggle } from "@app/hooks";

type Props = {
  isOpen?: boolean;
  onChange?: (isOpen: boolean) => void;
  deleteKey: string;
  title: string;
  subTitle?: string;
  onDeleteApproved: () => Promise<void>;
  buttonText?: string;
  isDisabled?: boolean;
};

export const MigrationConfigDeleteDialog = ({
  isOpen,
  onChange,
  deleteKey,
  title,
  subTitle = "This action is irreversible.",
  onDeleteApproved,
  buttonText = "Delete",
  isDisabled
}: Props) => {
  const [inputData, setInputData] = useState("");
  const [isLoading, setIsLoading] = useToggle();

  useEffect(() => {
    setInputData("");
  }, [isOpen]);

  const onDelete = async () => {
    setIsLoading.on();
    try {
      await onDeleteApproved();
    } finally {
      setIsLoading.off();
    }
  };

  return (
    <Dialog
      open={Boolean(isOpen)}
      onOpenChange={(open) => {
        if (!open) setInputData("");
        onChange?.(open);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{subTitle}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={async (evt) => {
            evt.preventDefault();
            if (deleteKey === inputData) await onDelete();
          }}
        >
          <Field>
            <FieldLabel className="text-sm break-words">
              Type <span className="font-bold">{deleteKey}</span> to perform this action
            </FieldLabel>
            <FieldContent>
              <UnstableInput
                value={inputData}
                onChange={(e) => setInputData(e.target.value)}
                placeholder={`Type ${deleteKey} here`}
                aria-invalid={inputData.length > 0 && deleteKey !== inputData}
              />
            </FieldContent>
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onChange?.(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            isPending={isLoading}
            isDisabled={deleteKey !== inputData || isLoading || isDisabled}
            onClick={async () => {
              await onDelete();
            }}
          >
            {buttonText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
