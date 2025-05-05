import { Modal, ModalContent } from "@app/components/v2";
import { useGetCertBody } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { CertificateContent } from "./CertificateContent";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionSub,
  useProjectPermission
} from "@app/context";
import { useGetCertBundle } from "@app/hooks/api/certificates/queries";

type Props = {
  popUp: UsePopUpState<["certificateCert"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["certificateCert"]>, state?: boolean) => void;
};

export const CertificateCertModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { permission } = useProjectPermission();

  const serialNumber =
    (popUp?.certificateCert?.data as { serialNumber: string })?.serialNumber || "";

  const canReadPrivateKey = permission.can(
    ProjectPermissionCertificateActions.ReadPrivateKey,
    ProjectPermissionSub.Certificates
  );

  const { data } = canReadPrivateKey
    ? useGetCertBundle(serialNumber)
    : useGetCertBody(serialNumber);

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
            // A hacky fix for typescript error
            privateKey={(data as { privateKey?: string }).privateKey}
          />
        ) : (
          <div />
        )}
      </ModalContent>
    </Modal>
  );
};
