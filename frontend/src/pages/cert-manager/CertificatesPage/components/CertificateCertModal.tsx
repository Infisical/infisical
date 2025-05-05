import { Modal, ModalContent } from "@app/components/v2";
import {
  ProjectPermissionCertificateActions,
  ProjectPermissionSub,
  useProjectPermission
} from "@app/context";
import { useGetCertBody } from "@app/hooks/api";
import { useGetCertBundle } from "@app/hooks/api/certificates/queries";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { CertificateContent } from "./CertificateContent";

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

  // useGetCertBundle fails unless user has the correct permissions
  const { data: bundleData } = useGetCertBundle(serialNumber);
  const { data: bodyData } = useGetCertBody(serialNumber);

  const data:
    | {
        certificate: string;
        certificateChain: string;
        serialNumber: string;
        privateKey?: string;
      }
    | undefined = canReadPrivateKey ? bundleData : bodyData;

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
            privateKey={data.privateKey}
          />
        ) : (
          <div />
        )}
      </ModalContent>
    </Modal>
  );
};
