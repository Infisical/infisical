import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { ShareSecretForm } from "@app/pages/public/ShareSecretPage/components";

type Props = {
  popUp: UsePopUpState<["createSharedSecret"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["createSharedSecret"]>,
    state?: boolean
  ) => void;
};

export const AddShareSecretModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { currentOrg } = useOrganization();
  return (
    <Dialog
      open={popUp?.createSharedSecret?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("createSharedSecret", isOpen);
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Share a Secret</DialogTitle>
          <DialogDescription>Securely share one off secrets with your team.</DialogDescription>
        </DialogHeader>
        <ShareSecretForm
          isPublic={false}
          value={(popUp.createSharedSecret.data as { value?: string })?.value}
          allowSecretSharingOutsideOrganization={
            currentOrg?.allowSecretSharingOutsideOrganization ?? true
          }
          maxSharedSecretLifetime={currentOrg?.maxSharedSecretLifetime}
          maxSharedSecretViewLimit={currentOrg?.maxSharedSecretViewLimit}
        />
      </DialogContent>
    </Dialog>
  );
};
