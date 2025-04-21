import { Modal, ModalContent } from "@app/components/v2";
import { useGetCertBody } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { CertificateContent } from "./CertificateContent";

type Props = {
  popUp: UsePopUpState<["certificateCert"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["certificateCert"]>, state?: boolean) => void;
};

export const CertificateCertModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { data } = useGetCertBody(
    (popUp?.certificateCert?.data as { serialNumber: string })?.serialNumber || ""
  );

  return (
    <Modal
      isOpen={popUp?.certificateCert?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("certificateCert", isOpen);
      }}
    >
      <ModalContent title="Export Certificate">
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
