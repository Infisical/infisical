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
            Securely request one off secrets from your team or people outside your organization.
          </DialogDescription>
        </DialogHeader>
        <RequestSecretForm />
      </DialogContent>
    </Dialog>
  );
};
