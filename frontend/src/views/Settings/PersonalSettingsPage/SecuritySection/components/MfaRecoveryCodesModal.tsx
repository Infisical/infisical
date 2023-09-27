import { FC, useEffect, useState } from "react";
import { faCopy, faDownload, faKey } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { Button } from "@app/components/v2";
import { useCreateNewMfaRecoveryCodes, useGetMyMfaRecoveryCodes } from "@app/hooks/api";

export const MfaRecoveryCodesModal: FC = () => {
  const {
    data: mfaRecoveryCodes,
    error: mfaRecoveryCodesError,
    isLoading: mfaRecoveryCodesLoading,
  } = useGetMyMfaRecoveryCodes();
  const { mutateAsync, isLoading: newCodesLoading, isError: newCodesError } = useCreateNewMfaRecoveryCodes();
  const [showMfaRecoveryCodesLoading, setShowMfaRecoveryCodesLoading] = useState<boolean>(true);
  const [showMfaRecoveryCodes, setShowMfaRecoveryCodes] = useState<string[]>([]);
  const [isDownloadingCodes, setIsDownloadingCodes] = useState<boolean>(false);
  const [isCopyingCodes, setIsCopyingCodes] = useState<boolean>(false);
  const { createNotification } = useNotificationContext();

  useEffect(()=> {
    if (!mfaRecoveryCodesLoading) {
      setShowMfaRecoveryCodesLoading(false);
      if (!mfaRecoveryCodesError && mfaRecoveryCodes && mfaRecoveryCodes.length) {
        setShowMfaRecoveryCodes(mfaRecoveryCodes);
      } else if (!mfaRecoveryCodesError && !mfaRecoveryCodes) {
        setShowMfaRecoveryCodes([]);
      }
    } else {
      setShowMfaRecoveryCodesLoading(true);
    }
  },[mfaRecoveryCodesLoading, mfaRecoveryCodes]);

  const handleDownloadMfaRecoveryCodes = (): void => {
    setIsDownloadingCodes(true);
    try {
      if (showMfaRecoveryCodes) {
        const text = showMfaRecoveryCodes.join("\n");
        const blob = new Blob([text], { type: "text/plain" });
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.setAttribute("download", "infisical-mfa-recovery-codes.txt");
        document.body.appendChild(link);
        link.click();
        link.remove();
        createNotification({
          text: "Successfully downloaded MFA recovery codes. Save them in a safe, secure & durable location.",
          type: "success"
        });
      }
    } catch (err) {
      console.error("Error downloading MFA recovery codes", err);
      createNotification({
        text: "Failed to download MFA recovery codes. Please try again.",
        type: "error"
      });
    } finally {
      setIsDownloadingCodes(false);
    }
  };

  const handleCopyMfaRecoveryCodes = () => {
    setIsCopyingCodes(true);
    try {
      if (showMfaRecoveryCodes) {
        navigator.clipboard.writeText(showMfaRecoveryCodes.join("\n"));
        createNotification({
          text: "Codes copied to clipboard. Save them in a safe, secure & durable location.",
          type: "success",
        });
      }
    } catch (err) {
      console.error("Error copying MFA recovery codes", err);
      createNotification({
        text: "Failed to copy MFA recovery codes. Please try again.",
        type: "error"
      });
    } finally {
      setIsCopyingCodes(false);
    }
  };

  const handleCreateNewMfaRecoveryCodes = async () => {
    try {
      createNotification({
        text: "Generating new MFA recovery codes...",
        type: "info"
      });

      const newCodes = await mutateAsync();
      setShowMfaRecoveryCodes(newCodes);
      
      createNotification({
        text: "Successfully generated new MFA recovery codes",
        type: "success"
      });
    } catch (err) {
      console.error("Error generating MFA recovery codes", err);
      createNotification({
        text: "Failed to generate MFA recovery codes",
        type: "error"
      });
    }
  };

  return (
    <div className="p-4 mb-4 flex flex-col items-center md:flex-row md:items-center md:justify-center flex-wrap">
      {!showMfaRecoveryCodesLoading && showMfaRecoveryCodes && showMfaRecoveryCodes.length > 0 && (
      <>
      <div className="p-2">
        <Button
          type="button"
          leftIcon={<FontAwesomeIcon icon={faCopy} />}
          onClick={() => handleCopyMfaRecoveryCodes()}
          isDisabled={newCodesLoading || newCodesError || isDownloadingCodes || isCopyingCodes}
        >
          Copy current codes
        </Button>
      </div>
      <div className="p-2">
        <Button
          type="button"
          leftIcon={<FontAwesomeIcon icon={faDownload} />}
          onClick={() => handleDownloadMfaRecoveryCodes()}
          isDisabled={newCodesLoading || newCodesError || isDownloadingCodes || isCopyingCodes}
        >
            Download current codes
          </Button>
      </div>
      </>
      )}
      {showMfaRecoveryCodesLoading && (
        <p>Decrypting MFA recovery codes...</p>
      )}
      <div className="p-2">
        <Button
          type="button"
          leftIcon={<FontAwesomeIcon icon={faKey} />}
          onClick={handleCreateNewMfaRecoveryCodes}
          isDisabled={newCodesLoading || newCodesError || isDownloadingCodes || isCopyingCodes}
        >
          Generate new codes
        </Button>
        {newCodesError && (
          <p>Error generating new MFA recovery codes</p>
        )}
      </div>
    </div>
  );
};
