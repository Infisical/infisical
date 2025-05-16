import { Modal, ModalContent } from "@app/components/v2";
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
    <Modal
      isOpen={popUp?.createSharedSecret?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("createSharedSecret", isOpen);
      }}
    >
      <ModalContent
        title="Share a Secret"
        subTitle="Securely share one off secrets with your team."
      >
        <ShareSecretForm
          isPublic={false}
          value={(popUp.createSharedSecret.data as { value?: string })?.value}
          allowSecretSharingOutsideOrganization={
            currentOrg?.allowSecretSharingOutsideOrganization ?? true
          }
          maxSharedSecretLifetime={currentOrg?.maxSharedSecretLifetime}
          maxSharedSecretViewLimit={currentOrg?.maxSharedSecretViewLimit}
        />
      </ModalContent>
    </Modal>
  );
};
