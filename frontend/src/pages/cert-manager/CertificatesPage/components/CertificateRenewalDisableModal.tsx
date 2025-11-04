import { createNotification } from "@app/components/notifications";
import { Button, Modal, ModalContent } from "@app/components/v2";
import { useProject } from "@app/context";
import { useUpdateRenewalConfig } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  popUp: UsePopUpState<["disableRenewal"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["disableRenewal"]>, state?: boolean) => void;
};

export const CertificateRenewalDisableModal = ({ popUp, handlePopUpToggle }: Props) => {
  const { currentProject } = useProject();
  const { mutateAsync: updateRenewalConfig, isPending: isSubmitting } = useUpdateRenewalConfig();

  const certificateData = popUp.disableRenewal.data as {
    certificateId: string;
    commonName: string;
  };

  const onDisableConfirm = async () => {
    if (!currentProject?.slug) {
      createNotification({
        text: "Project not found",
        type: "error"
      });
      return;
    }

    await updateRenewalConfig({
      certificateId: certificateData.certificateId,
      projectSlug: currentProject.slug,
      enableAutoRenewal: false
    });

    createNotification({
      text: "Successfully disabled auto-renewal",
      type: "success"
    });

    handlePopUpToggle("disableRenewal", false);
  };

  return (
    <Modal
      isOpen={popUp?.disableRenewal?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("disableRenewal", isOpen);
      }}
    >
      <ModalContent title={`Disable Auto-Renewal: ${certificateData?.commonName || ""}`}>
        <div className="mb-4">
          <p className="mb-3 text-sm text-mineshaft-300">
            Are you sure you want to disable auto-renewal for this certificate?
          </p>
          <div className="rounded border border-yellow-700/50 bg-yellow-900/20 p-3">
            <p className="text-sm text-yellow-300">
              <strong>Warning:</strong> Once disabled, this certificate will not be automatically
              renewed and may expire without notice. You can re-enable auto-renewal at any time.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            className="mr-4"
            size="sm"
            colorSchema="danger"
            onClick={onDisableConfirm}
            isLoading={isSubmitting}
            isDisabled={isSubmitting}
          >
            Disable Auto-Renewal
          </Button>
          <Button
            colorSchema="secondary"
            variant="plain"
            onClick={() => handlePopUpToggle("disableRenewal", false)}
          >
            Cancel
          </Button>
        </div>
      </ModalContent>
    </Modal>
  );
};
