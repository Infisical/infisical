import { FC, useEffect, useState } from "react";
import { faBan, faCheck, faDownload } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { Button } from "@app/components/v2";
import { RedirectButton } from "@app/helpers/redirectHelper";
import { useCreateNewMfaRecoveryCodes } from "@app/hooks/api";

interface Step2ShowMfaRecoveryCodesProps {
  onSuccess: () => void;
};

export const Step2ShowMfaRecoveryCodes: FC<Step2ShowMfaRecoveryCodesProps> = ({ onSuccess }) => {
  const [newMfaRecoveryCodes, setNewMfaRecoveryCodes] = useState<string[]>();
  const [isDownloadingCodes, setIsDownloadingCodes] = useState<boolean>(false);
  const [isContinueButtonActive, setIsContinueButtonActive] = useState<boolean>(false);
  const { createNotification } = useNotificationContext();
  const { mutateAsync, isLoading: newCodesLoading, isError: newCodesError } = useCreateNewMfaRecoveryCodes();

  useEffect(() => {
    const fetchData = async () => {
      try {
        const generatedCodes = await mutateAsync();
        setNewMfaRecoveryCodes(generatedCodes);
      } catch (err) {
        console.error("Error generating new MFA recovery codes:", err);
        createNotification({
          text: "Error generating new MFA recovery codes!",
          type: "success"
        });
      }
    };
    fetchData();
  }, [mutateAsync]);

  const handleDownloadMfaRecoveryCodes = async (): Promise<void> => {
    try {
      setIsDownloadingCodes(true);
      if (newMfaRecoveryCodes) {
        const text = newMfaRecoveryCodes.join("\n");
        const blob = new Blob([text], { type: "text/plain" });
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.setAttribute("download", "infisical-mfa-recovery-codes.txt");
        document.body.appendChild(link);
        link.click();
        link.remove();
        createNotification({
          text: "Successfully downloaded MFA recovery codes",
          type: "success"
        });
        setIsContinueButtonActive(true);
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

  const handleMoveToMfaModalSetupStep3 = (): void => {
    try {
      onSuccess();
    } catch (err) {
      console.error("Error moving to MFA modal step 3", err);
      createNotification({
        text: "Error moving to the next step setting up MFA with the authenticator app. Please try again.",
        type: "error"
      });
    }
  };

  return (
    <>
      {newCodesLoading && (
      <p>
        Generating MFA recovery codes...
      </p>
      )} 
      {!newCodesLoading && !newCodesError && newMfaRecoveryCodes && newMfaRecoveryCodes.length && (
      <>
        <div>
          <p><strong>Download your MFA recovery codes</strong><br /><br />
            You can use these codes as a second factor to authenticate in case you lose access to your device.
            Infisical recommends saving them in a secure password manager such as <a href='https://1password.com/' target='_blank' rel='noreferrer'><u>1Password</u></a> or <a href='https://bitwarden.com/' target='_blank' rel='noreferrer'><u>Bitwarden</u></a>. Alternatively, print the codes and keep them in a safe, secure and durable location.<br /><br /><strong>If you lose your device and don&apos;t have these recovery codes, you will lose access to your account.</strong>
          </p>
        </div><br /><br />
        <div className="flex items-center justify-between flex-grow">
          <div>
            <Button
              type="button"
              leftIcon={<FontAwesomeIcon icon={faDownload} />}
              isDisabled={isDownloadingCodes}
              onClick={() => handleDownloadMfaRecoveryCodes()}
            >
              Download
            </Button>
          </div>
          <div>
            <Button
              type="button"
              leftIcon={<FontAwesomeIcon icon={faCheck} />}
              isDisabled={isDownloadingCodes || !isContinueButtonActive}
              onClick={() => handleMoveToMfaModalSetupStep3()}
            >
              I have saved my recovery codes
            </Button>
          </div>
          <div className="flex items-center ml-4">
            <RedirectButton
              text="Cancel"
              redirectText="Redirecting to personal settings page..."
              path="/personal-settings" 
              isDisabled={isDownloadingCodes}
              leftIcon={<FontAwesomeIcon icon={faBan} />}
            />
          </div>
        </div>
      </>
      )}
      {newCodesError && (
      <p>
        Error! Failed to generate MFA recovery codes.
      </p>
      )}
    </>
  )
};
