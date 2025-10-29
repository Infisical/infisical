import { Modal, ModalContent } from "@app/components/v2";
import { useOrganization } from "@app/context";
import { usePopUp } from "@app/hooks/usePopUp";
import { ShareSecretForm } from "@app/pages/public/ShareSecretPage/components";
import { ReactNode } from "@tanstack/react-router";
import { createContext, useCallback } from "react";

type Props = {
  children: ReactNode
};

export const HandleCreateSharedSecretPopupOpenContext = createContext<((value: string) => void) | undefined>(undefined)

export const ShareSecretModalProvider = ({children}: Props) => {
  const { currentOrg } = useOrganization();

  const { handlePopUpOpen, popUp, handlePopUpToggle } = usePopUp([
      "createSharedSecret"
    ] as const);

    const openModalFunction = useCallback((value: string) => {
      handlePopUpOpen("createSharedSecret", {value})
    }, [handlePopUpOpen])

  return (<HandleCreateSharedSecretPopupOpenContext.Provider value={openModalFunction}>
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
    {children}
    </HandleCreateSharedSecretPopupOpenContext.Provider>
  );
};


