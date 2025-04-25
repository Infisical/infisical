import { Modal, ModalContent } from "@app/components/v2";
import { useGetCaCert } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { CertificateContent } from "../../CertificatesPage/components/CertificateContent";

type Props = {
  popUp: UsePopUpState<["caCert"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["caCert"]>, state?: boolean) => void;
};

export const CaCertModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { data } = useGetCaCert((popUp?.caCert?.data as { caId: string })?.caId || "");
  return (
    <Modal
      isOpen={popUp?.caCert?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("caCert", isOpen);
      }}
    >
      <ModalContent title="CA Certificate">
        {data ? (
          <CertificateContent
            serialNumber={data.serialNumber}
            certificate={data.certificate}
            certificateChain={data.certificateChain}
          />
        ) : (
          <div />
        )}
      </ModalContent>
    </Modal>
  );
};
