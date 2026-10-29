import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@app/components/v3";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { RequestSecretForm } from "./RequestSecretForm";

type Props = {
  popUp: UsePopUpState<["createSecretRequest"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["createSecretRequest"]>,
    state?: boolean
  ) => void;
};

export const AddSecretRequestModal = ({ popUp, handlePopUpToggle }: Props) => {
  return (
    <Dialog
      open={popUp?.createSecretRequest?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("createSecretRequest", isOpen);
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Request a Secret</DialogTitle>
          <DialogDescription>
            Create a link that lets someone send you a secret without exposing it over chat or
            email.
          </DialogDescription>
        </DialogHeader>
        <RequestSecretForm />
      </DialogContent>
    </Dialog>
  );
};
