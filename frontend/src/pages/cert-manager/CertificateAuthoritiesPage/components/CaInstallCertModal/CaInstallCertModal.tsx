import { useEffect, useState } from "react";

import { FormControl, Modal, ModalContent, Select, SelectItem } from "@app/components/v2";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { ExternalCaInstallForm } from "./ExternalCaInstallForm";
import { InternalCaInstallForm } from "./InternalCaInstallForm";

type Props = {
  popUp: UsePopUpState<["installCaCert"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["installCaCert"]>, state?: boolean) => void;
};

enum ParentCaType {
  Internal = "internal",
  External = "external"
}

export const CaInstallCertModal = ({ popUp, handlePopUpToggle }: Props) => {
  const popupData = popUp?.installCaCert?.data;
  const caId = popupData?.caId || "";
  const isParentCaExternal = popupData?.isParentCaExternal || false;
  const [parentCaType, setParentCaType] = useState<ParentCaType>(ParentCaType.Internal);

  useEffect(() => {
    if (popupData?.isParentCaExternal) {
      setParentCaType(ParentCaType.External);
    }
  }, [popupData]);

  const renderForm = (parentCaTypeInput: ParentCaType) => {
    switch (parentCaTypeInput) {
      case ParentCaType.Internal:
        return <InternalCaInstallForm caId={caId} handlePopUpToggle={handlePopUpToggle} />;
      default:
        return <ExternalCaInstallForm caId={caId} handlePopUpToggle={handlePopUpToggle} />;
    }
  };

  return (
    <Modal
      isOpen={popUp?.installCaCert?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("installCaCert", isOpen);
      }}
    >
      <ModalContent
        title={`${isParentCaExternal ? "Renew" : "Install"} Intermediate CA certificate`}
      >
        <FormControl label="Parent CA Type">
          <Select
            value={parentCaType}
            onValueChange={(e) => setParentCaType(e as ParentCaType)}
            className="w-full"
            isDisabled={isParentCaExternal}
          >
            <SelectItem
              value={ParentCaType.Internal}
              key={`parent-ca-type-${ParentCaType.Internal}`}
            >
              Infisical CA
            </SelectItem>
            <SelectItem
              value={ParentCaType.External}
              key={`parent-ca-type-${ParentCaType.External}`}
            >
              External CA
            </SelectItem>
          </Select>
        </FormControl>
        {renderForm(parentCaType)}
      </ModalContent>
    </Modal>
  );
};
