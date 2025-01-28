import { useState } from "react";

import { Modal, ModalContent } from "@app/components/v2";
import { IdentityAuthMethod, identityAuthToNameMap } from "@app/hooks/api/identities";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { IdentityAuthMethodModalContent } from "./IdentityAuthMethodModalContent";

type Props = {
  popUp: UsePopUpState<["identityAuthMethod", "upgradePlan"]>;
  handlePopUpOpen: (popUpName: keyof UsePopUpState<["upgradePlan"]>) => void;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["identityAuthMethod", "upgradePlan"]>,
    state?: boolean
  ) => void;
};

export const IdentityAuthMethodModal = ({ popUp, handlePopUpOpen, handlePopUpToggle }: Props) => {
  const [selectedAuthMethod, setSelectedAuthMethod] = useState<IdentityAuthMethod | null>(null);

  const initialAuthMethod = popUp?.identityAuthMethod?.data?.authMethod;

  const isSelectedAuthAlreadyConfigured =
    popUp?.identityAuthMethod?.data?.allAuthMethods?.includes(selectedAuthMethod);

  return (
    <Modal
      isOpen={popUp?.identityAuthMethod?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("identityAuthMethod", isOpen);
      }}
    >
      <ModalContent
        title={
          isSelectedAuthAlreadyConfigured
            ? `Edit ${identityAuthToNameMap[selectedAuthMethod!] ?? ""}`
            : `Add ${identityAuthToNameMap[selectedAuthMethod!] ?? ""}`
        }
      >
        <IdentityAuthMethodModalContent
          popUp={popUp}
          handlePopUpOpen={handlePopUpOpen}
          handlePopUpToggle={handlePopUpToggle}
          identity={{
            name: popUp?.identityAuthMethod?.data?.name,
            authMethods: popUp?.identityAuthMethod?.data?.allAuthMethods,
            id: popUp?.identityAuthMethod.data?.identityId
          }}
          initialAuthMethod={initialAuthMethod}
          setSelectedAuthMethod={setSelectedAuthMethod}
        />
      </ModalContent>
    </Modal>
  );
};
