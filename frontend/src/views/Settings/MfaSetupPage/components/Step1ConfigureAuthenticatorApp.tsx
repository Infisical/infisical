import React, { ChangeEvent,FC, useEffect, useState } from "react";
import { useRouter } from "next/router";
import QRCode from "qrcode";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { Button, Input } from "@app/components/v2";
import { RedirectButton } from "@app/helpers/redirectHelper";
import { enableMfaAuthAppStep2,useGetUser } from "@app/hooks/api";
import { generateMfaAuthAppConfigUri } from "@app/views/Settings/MfaSetupPage/components/generateMfaAuthAppConfigUri";

type Step1ConfigureAuthenticatorAppProps = {
  onSuccess: () => void;
};

export const Step1ConfigureAuthenticatorApp: FC<Step1ConfigureAuthenticatorAppProps> = ({ onSuccess }) => {
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string | null>(null);
  const [twoFactorSecretKey, setTwoFactorSecretKey] = useState<string | null>(null);
  const [showSecretKey, setShowSecretKey] = useState<boolean>(false);
  const [userTotp, setUserTotp] = useState<string>("");
  const { createNotification } = useNotificationContext();
  const { data: user, error: userError } = useGetUser();
  const router = useRouter();
  const TOTP_LENGTH = 6;
  const PAGE_REDIRECT_TIMEOUT = 250;
  let redirectTimeout: NodeJS.Timeout | undefined;
  let qrCodeGenerationTimeout: NodeJS.Timeout | undefined;
  let qrCodeReloadCount = 0;

  const redirectToPersonalSettingsPage = () => {
    try {
      createNotification({
        text: "Redirecting to personal settings page...",
        type: "info"
      });

      redirectTimeout = setTimeout(() => {
        router.push("/personal-settings");
      }, PAGE_REDIRECT_TIMEOUT);

      return () => {
        clearTimeout(redirectTimeout);
      };
    } catch (err: any) {
      console.error("Redirect to personal settings page failed", err);
      createNotification({
        text: "Redirect to personal settings page failed",
        type: "error"
      });
    }
    return null;
  };

  const handleQRCodeError = () => {
    const QR_CODE_RELOAD_LIMIT = 3;
    const QR_CODE_RELOAD_INTERVAL = 1000;

    createNotification({
      text: "Error generating QR code. Reloading page...",
      type: "error"
    });

    qrCodeReloadCount += 1;

    if (qrCodeReloadCount >= QR_CODE_RELOAD_LIMIT) {
      redirectToPersonalSettingsPage();
    } else {
      qrCodeGenerationTimeout = setTimeout(() => {
        window.location.reload();
      }, QR_CODE_RELOAD_INTERVAL);
    }
  };

  const generateQRCode = async () => {
    try {
      setIsLoading(true);

      if(user) {
        const result = await generateMfaAuthAppConfigUri({ name: user?.email, userId: user?._id });
        const { secretKey, uri } = result || {};
        if (secretKey && uri) {
          const qrCodeDataURL = await QRCode.toDataURL(uri);
          setTwoFactorSecretKey(secretKey);
          setQrCodeDataUrl(qrCodeDataURL);
        } else {
          handleQRCodeError();
        }
      }
    } catch (err) {
      console.error("Failed to fetch QR code:", err)
      handleQRCodeError();
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user?.email) {
      generateQRCode();
    }
    
    return () => {
      clearTimeout(qrCodeGenerationTimeout);
    };
  }, [user?.email]);

  if (userError || !user) {
    return <p>Error getting user.</p>;
  };

  const handleSubmit = async () => {
    try {
      setIsLoading(true);

      if (userTotp) {
        const isAuthAppMfaEnabled = await enableMfaAuthAppStep2({ userTotp });

        if (isAuthAppMfaEnabled) {
          onSuccess();
          setUserTotp("");
        } else {
          createNotification({
            text: "TOTP verifiction failed. Please try again.",
            type: "error"
          });
        }
      } else {
        createNotification({
          text: "Invalid TOTP format. Please try again.",
          type: "error"
        });
      }
    } catch (err) {
      console.error("Error setting up MFA with the authenicator app:", err);
      createNotification({
        text: "Failed to setup MFA with the authenticator app. Please try again.",
        type: "error"
      });
    } finally {
      setUserTotp("");
      setIsLoading(false);
    }
  };

  const handleVerifyTotp = (e: ChangeEvent<HTMLInputElement>): void => {
    const totpValue = e.target.value;
    setUserTotp(totpValue);
  };

  const toggleSecretKeyVisibility = (show: boolean) => {
    setIsLoading(true);

    if (twoFactorSecretKey) {
      setShowSecretKey(show);
    } else {
      setShowSecretKey(false);
      createNotification({
        text: "Failed to show secret key",
        type: "error"
      });
    }
    setIsLoading(false);
  };

  const viewSecretKey = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    e.preventDefault();
    toggleSecretKeyVisibility(true);
  };

  const hideSecretKey = (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    e.preventDefault();
    toggleSecretKeyVisibility(false);
  };

  const copySecretKey = async (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (twoFactorSecretKey) {
        navigator.clipboard.writeText(twoFactorSecretKey);
        createNotification({
          text: "Secret key copied to the clipboard. Save securely.",
          type: "success"
        });        
      } else {
        createNotification({
          text: "Error copying secret key to the clipboard.",
          type: "error"
        });    
        throw new Error("Error copying secret key to the clipboard.");
      }
    } catch (err) {
      console.error("Error copying secret key:", err);
      createNotification({
        text: "Error copying secret key to the clipboard.",
        type: "error"
      });  
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <p>Loading...</p>;
  };

  return (
    <>
      <p className="font-bold">Setup authenticator app</p>
      <p>
        Authenticator apps generate one-time passwords that are used as a
        second factor to verify your identity when prompted during sign-in.{" "}
        Infisical recommends{" "}
        <a href='https://getaegis.app/' target='_blank' rel='noreferrer' className="underline">Aegis Authenticator</a>
        {" "}for Android,{" "}
        <a href='https://apps.apple.com/us/app/google-authenticator/id388497605#?platform=iphone' target='_blank' rel='noreferrer' className="underline">Google Authenticator</a>
        {" "}for Android/iOS, or{" "}
        <a href='https://support.1password.com/one-time-passwords/' target='_blank' rel='noreferrer' className="underline">1Password</a>
        {" "}for the browser.<br/><br/>
        We strongly recommend you do not sync your TOTP codes to a cloud provider due to security reasons.<br/><br/>
        Please note that Infisical uses SHA-256 as the TOTP hash algorithm, which is not compatible with some authenticator apps, but has been widely adopted.{" "}
        See{" "}
        <a href='https://labanskoller.se/blog/2023/03/16/mobile-authenticator-apps-algorithm-support-review-2023-edition/' target='_blank' rel='noreferrer' className="underline">here</a>{" "}
        for an updated list of apps that fully support non-default authenticator settings.<br/><br/>
        You can read more about enabling MFA with Infisical{" "}
        <a href='https://infisical.com/docs/documentation/platform/mfa' target='_blank' rel='noreferrer' className="underline">here</a>.
      </p>
      <br />
      <p className="font-bold">1. Scan the QR code</p>
      <p>
        Use an authenticator app or browser extension to scan.
      </p>
      <br />
      {user && qrCodeDataUrl && twoFactorSecretKey && (
        <>
          <div>
            <img src={qrCodeDataUrl} alt="QR Code" />
          </div>
          <br />
          <div>
            <p>
              Unable to scan? You can use the two-factor secret key to manually configure your authenticator app. Ensure you save this securely (eg. in a password manager).
            </p><br />
            <div className="flex items-center">
              {!showSecretKey ? (
                <Button type="button" onClick={viewSecretKey}>
                  Show Key
                </Button>
              ) : (
                <div className="space-x-2">
                  <Button type="button" onClick={hideSecretKey}>
                    Hide Key
                  </Button>
                  <Button type="button" onClick={copySecretKey}>
                    Copy Key
                  </Button>
                </div>
              )}
              <div className="ml-4">{showSecretKey ? twoFactorSecretKey : null}</div>
            </div>
            <br />
            <p className="font-bold">2. Verify the code from the app</p><br />
            <div>
              <Input
                type="text"
                name="userTotp"
                value={userTotp}
                placeholder="XXXXXX"
                onChange={handleVerifyTotp}
                maxLength={TOTP_LENGTH}
              />
            </div>
            <br />
            <div className="flex space-x-2 mt-4">
              <Button
                type="button"
                onClick={handleSubmit}
                isDisabled={isLoading || !new RegExp(`^\\d{${TOTP_LENGTH}}$`).test(userTotp)}
              >
                {isLoading ? "Loading..." : "Continue"}
              </Button>
              <RedirectButton 
                text="Cancel" 
                redirectText="Redirecting to personal settings page..."
                path="/personal-settings" 
                isDisabled={isLoading}
              />
            </div>
          </div>
        </>
      )}
    </>
  );
};
