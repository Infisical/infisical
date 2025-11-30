import { faRedo } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { Button, Modal, ModalContent } from "@app/components/v2";
import { useRenewCertificate } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  popUp: UsePopUpState<["renewCertificate"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["renewCertificate"]>,
    state?: boolean
  ) => void;
};

export const CertificateRenewalModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { mutateAsync: renewCertificate, isPending: isRenewing } = useRenewCertificate();

  const onRenewConfirm = async () => {
    const { certificateId } = popUp.renewCertificate.data as { certificateId: string };

    const result = await renewCertificate({
      certificateId
    });

    const notificationText = result.certificateRequestId
      ? `Certificate renewal initiated successfully. Request ID: ${result.certificateRequestId}`
      : "Certificate renewed successfully";

    createNotification({
      text: notificationText,
      type: "success"
    });

    handlePopUpToggle("renewCertificate", false);
  };

  const certificateData = popUp.renewCertificate.data as {
    certificateId: string;
    commonName: string;
    profileId: string;
  };

  return (
    <Modal
      isOpen={popUp?.renewCertificate?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("renewCertificate", isOpen);
      }}
    >
      <ModalContent title={`Renew Certificate: ${certificateData?.commonName || ""}`}>
        <div className="mb-6">
          <p className="mb-4 text-sm text-mineshaft-300">
            Are you sure you want to renew this certificate now?
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={onRenewConfirm}
            colorSchema="primary"
            isLoading={isRenewing}
            isDisabled={isRenewing}
          >
            <FontAwesomeIcon icon={faRedo} className="mr-2" />
            Renew Now
          </Button>
          <Button
            colorSchema="secondary"
            variant="plain"
            onClick={() => handlePopUpToggle("renewCertificate", false)}
          >
            Cancel
          </Button>
        </div>
      </ModalContent>
    </Modal>
  );
};
