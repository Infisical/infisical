import { faCopy } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { Button, IconButton, Modal, ModalContent, Tooltip } from "@app/components/v2";
import { TEmailDomain, useVerifyEmailDomain } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  popUp: UsePopUpState<["verifyDomain"]>;
  handlePopUpClose: (popUpName: keyof UsePopUpState<["verifyDomain"]>) => void;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["verifyDomain"]>, state?: boolean) => void;
};

export const EmailDomainVerificationModal = ({
  popUp,
  handlePopUpClose,
  handlePopUpToggle
}: Props) => {
  const domainData = popUp?.verifyDomain?.data as TEmailDomain | undefined;

  const { mutateAsync: verifyDomain, isPending } = useVerifyEmailDomain();

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    createNotification({ text: "Copied to clipboard", type: "info" });
  };

  const handleVerify = async () => {
    if (!domainData) return;
    try {
      await verifyDomain({ emailDomainId: domainData.id });
      createNotification({
        text: "Domain verified successfully!",
        type: "success"
      });
      handlePopUpClose("verifyDomain");
    } catch (error) {
      createNotification({
        text:
          (error as Error)?.message ||
          "Failed to verify domain. Please check your DNS records and try again.",
        type: "error"
      });
    }
  };

  const txtValue = `infisical-domain-verification=${domainData?.verificationCode ?? ""}`;

  return (
    <Modal
      isOpen={popUp?.verifyDomain?.isOpen}
      onOpenChange={(isOpen) => handlePopUpToggle("verifyDomain", isOpen)}
    >
      <ModalContent
        title="Verify Email Domain"
        subTitle={`Add the following DNS TXT record to verify ownership of ${domainData?.domain ?? ""}`}
      >
        <div className="space-y-4">
          <div className="rounded-md border border-mineshaft-600 bg-mineshaft-800 p-4">
            <div className="mb-3">
              <p className="mb-1 text-sm font-medium text-gray-400">Record Type</p>
              <p className="text-sm text-gray-200">TXT</p>
            </div>
            <div className="mb-3">
              <div className="flex items-center justify-between">
                <p className="mb-1 text-sm font-medium text-gray-400">Record Name</p>
                <Tooltip content="Copy">
                  <IconButton
                    ariaLabel="copy record name"
                    variant="plain"
                    size="xs"
                    onClick={() => handleCopy(domainData?.verificationRecordName ?? "")}
                  >
                    <FontAwesomeIcon icon={faCopy} className="text-gray-400" />
                  </IconButton>
                </Tooltip>
              </div>
              <code className="block rounded bg-mineshaft-700 px-2 py-1 text-sm break-all text-gray-200">
                {domainData?.verificationRecordName}
              </code>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <p className="mb-1 text-sm font-medium text-gray-400">Record Value</p>
                <Tooltip content="Copy">
                  <IconButton
                    ariaLabel="copy record value"
                    variant="plain"
                    size="xs"
                    onClick={() => handleCopy(txtValue)}
                  >
                    <FontAwesomeIcon icon={faCopy} className="text-gray-400" />
                  </IconButton>
                </Tooltip>
              </div>
              <code className="block rounded bg-mineshaft-700 px-2 py-1 text-sm break-all text-gray-200">
                {txtValue}
              </code>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            DNS changes may take up to 48 hours to propagate. The verification code expires 7 days
            after creation.
          </p>
          <div className="flex items-center space-x-4">
            <Button size="sm" onClick={handleVerify} isLoading={isPending} isDisabled={isPending}>
              Verify Domain
            </Button>
            <Button
              colorSchema="secondary"
              variant="plain"
              onClick={() => handlePopUpClose("verifyDomain")}
            >
              Close
            </Button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
};
