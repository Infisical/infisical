import { faCheck, faCopy, faDownload } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { FormLabel, IconButton, Input, Modal, ModalContent } from "@app/components/v2";
import { downloadFile } from "@app/helpers/download";
import { useToggle } from "@app/hooks";
import {
  ScepChallengeType,
  TCertificateProfileWithDetails
} from "@app/hooks/api/certificateProfiles";

const RESET_COPIED_DELAY = 1 * 1000;

type Props = {
  isOpen: boolean;
  onClose: () => void;
  profile: TCertificateProfileWithDetails;
};

export const ScepDetailsModal = ({ isOpen, onClose, profile }: Props) => {
  const [isUrlCopied, setIsUrlCopied] = useToggle(false);
  const [isChallengeUrlCopied, setIsChallengeUrlCopied] = useToggle(false);

  const { scepConfig } = profile;
  const scepEndpointUrl = scepConfig?.scepEndpointUrl ?? "";

  if (!scepConfig) {
    return (
      <Modal isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
        <ModalContent title="SCEP Enrollment Details">
          <p className="text-sm text-mineshaft-400">
            SCEP configuration is not available for this profile.
          </p>
        </ModalContent>
      </Modal>
    );
  }

  const raCertPem = scepConfig.raCertificatePem;
  const raCertExpiresAt = scepConfig.raCertExpiresAt
    ? new Date(scepConfig.raCertExpiresAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric"
      })
    : "Unknown";

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <ModalContent
        title="SCEP Enrollment Details"
        subTitle="To enroll devices via SCEP, configure your MDM or device with the following details."
      >
        <FormLabel
          label="SCEP Endpoint URL"
          tooltipText="The URL your SCEP client or MDM should point to for certificate enrollment."
        />
        <div className="flex gap-2">
          <Input value={scepEndpointUrl} isDisabled />
          <IconButton
            ariaLabel="copy"
            variant="outline_bg"
            colorSchema="secondary"
            onClick={() => {
              navigator.clipboard.writeText(scepEndpointUrl);
              setIsUrlCopied.on();
              setTimeout(() => {
                setIsUrlCopied.off();
              }, RESET_COPIED_DELAY);
            }}
            className="w-10"
          >
            <FontAwesomeIcon icon={isUrlCopied ? faCheck : faCopy} />
          </IconButton>
        </div>

        {scepConfig.challengeType === ScepChallengeType.DYNAMIC &&
          scepConfig.challengeEndpointUrl && (
            <>
              <FormLabel
                label="Challenge Endpoint URL"
                className="mt-4"
                tooltipText="The authenticated API endpoint to generate dynamic SCEP challenges. Use this URL in your MDM webhook configuration (e.g., JAMF SCEPChallenge)."
              />
              <div className="flex gap-2">
                <Input value={scepConfig.challengeEndpointUrl} isDisabled />
                <IconButton
                  ariaLabel="copy"
                  variant="outline_bg"
                  colorSchema="secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(scepConfig.challengeEndpointUrl!);
                    setIsChallengeUrlCopied.on();
                    setTimeout(() => {
                      setIsChallengeUrlCopied.off();
                    }, RESET_COPIED_DELAY);
                  }}
                  className="w-10"
                >
                  <FontAwesomeIcon icon={isChallengeUrlCopied ? faCheck : faCopy} />
                </IconButton>
              </div>
            </>
          )}

        <FormLabel
          label="RA Certificate"
          className="mt-4"
          tooltipText="The Registration Authority certificate used by SCEP clients."
        />
        <div className="flex items-center justify-between rounded-md border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
          <p className="text-xs text-mineshaft-400">Expires: {raCertExpiresAt}</p>
          <IconButton
            ariaLabel="download RA certificate"
            variant="outline_bg"
            colorSchema="secondary"
            onClick={() =>
              downloadFile(raCertPem, `${profile.slug}-ra-cert.pem`, "application/x-pem-file")
            }
            className="flex items-center gap-2"
          >
            <FontAwesomeIcon icon={faDownload} />
            <span className="text-sm">Download PEM</span>
          </IconButton>
        </div>
      </ModalContent>
    </Modal>
  );
};
