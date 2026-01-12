import React, { useEffect, useState } from "react";
import ReactCodeInput from "react-code-input";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { Link, useNavigate } from "@tanstack/react-router";
import { t } from "i18next";

import Error from "@app/components/basic/Error";
import TotpRegistration from "@app/components/mfa/TotpRegistration";
import { createNotification } from "@app/components/notifications";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { Button, Input, Tooltip } from "@app/components/v2";
import { isInfisicalCloud } from "@app/helpers/platform";
import { useLogoutUser, useSendMfaToken } from "@app/hooks/api";
import {
  checkUserTotpMfa,
  checkUserWebAuthnMfa,
  verifyMfaToken,
  verifyRecoveryCode
} from "@app/hooks/api/auth/queries";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { getMfaTempToken } from "@app/hooks/api/reactQuery";
import {
  useGenerateAuthenticationOptions,
  useGenerateRegistrationOptions,
  useVerifyAuthentication,
  useVerifyRegistration
} from "@app/hooks/api/webauthn";

// The style for the verification code input
const codeInputProps = {
  inputStyle: {
    fontFamily: "monospace",
    margin: "4px",
    MozAppearance: "textfield",
    width: "55px",
    borderRadius: "5px",
    fontSize: "24px",
    height: "55px",
    paddingLeft: "7",
    backgroundColor: "#0d1117",
    color: "white",
    border: "1px solid #2d2f33",
    textAlign: "center",
    outlineColor: "#8ca542",
    borderColor: "#2d2f33"
  }
} as const;

const codeInputPropsPhone = {
  inputStyle: {
    fontFamily: "monospace",
    margin: "4px",
    MozAppearance: "textfield",
    width: "40px",
    borderRadius: "5px",
    fontSize: "24px",
    height: "40px",
    paddingLeft: "7",
    backgroundColor: "#0d1117",
    color: "white",
    border: "1px solid #2d2f33",
    textAlign: "center",
    outlineColor: "#8ca542",
    borderColor: "#2d2f33"
  }
} as const;

type Props = {
  successCallback: () => void | Promise<void>;
  closeMfa?: () => void;
  hideLogo?: boolean;
  email: string;
  method: MfaMethod;
};

export const Mfa = ({ successCallback, closeMfa, hideLogo, email, method }: Props) => {
  const [mfaCode, setMfaCode] = useState("");
  const [showRecoveryCodeInput, setShowRecoveryCodeInput] = useState(false);
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingResend, setIsLoadingResend] = useState(false);
  const [triesLeft, setTriesLeft] = useState<number | undefined>(undefined);
  const [shouldShowTotpRegistration, setShouldShowTotpRegistration] = useState(false);
  const [shouldShowWebAuthnRegistration, setShouldShowWebAuthnRegistration] = useState(false);
  const [credentialName, setCredentialName] = useState("");
  const [isRegisteringPasskey, setIsRegisteringPasskey] = useState(false);
  const logout = useLogoutUser(true);

  const { mutateAsync: generateWebAuthnAuthenticationOptions } = useGenerateAuthenticationOptions();
  const { mutateAsync: verifyWebAuthnAuthentication } = useVerifyAuthentication();

  const sendMfaToken = useSendMfaToken();
  const generateRegistrationOptions = useGenerateRegistrationOptions();
  const verifyRegistration = useVerifyRegistration();

  useEffect(() => {
    if (method === MfaMethod.TOTP) {
      checkUserTotpMfa().then((isVerified) => {
        if (!isVerified) {
          SecurityClient.setMfaToken("");
          setShouldShowTotpRegistration(true);
        }
      });
    } else if (method === MfaMethod.WEBAUTHN) {
      checkUserWebAuthnMfa().then((hasPasskeys) => {
        if (!hasPasskeys) {
          setShouldShowWebAuthnRegistration(true);
        }
      });
    }
  }, [method]);

  const getExpectedCodeLength = () => {
    if (method === MfaMethod.EMAIL) return 6;
    if (method === MfaMethod.TOTP) return showRecoveryCodeInput ? 8 : 6;
    return 6;
  };

  const isCodeComplete = mfaCode.length === getExpectedCodeLength();

  const verifyMfa = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!mfaCode.trim() || !isCodeComplete) return;

    setIsLoading(true);
    try {
      let result;

      if (method === MfaMethod.TOTP && showRecoveryCodeInput) {
        result = await verifyRecoveryCode(mfaCode.trim());
      } else {
        result = await verifyMfaToken({
          email,
          mfaCode: mfaCode.trim(),
          mfaMethod: method
        });
      }

      SecurityClient.setMfaToken("");
      SecurityClient.setToken(result.token);

      await successCallback();
      if (closeMfa) {
        closeMfa();
      }
    } catch {
      if (typeof triesLeft === "number") {
        const newTriesLeft = triesLeft - 1;
        setTriesLeft(newTriesLeft);
        if (newTriesLeft <= 0) {
          createNotification({
            text: "User is temporary locked due to multiple failed login attempts. Try again later. You can also reset your password now to proceed.",
            type: "error"
          });
          setIsLoading(false);
          SecurityClient.setMfaToken("");
          SecurityClient.setToken("");
          SecurityClient.setSignupToken("");
          await logout.mutateAsync();
          navigate({ to: "/login" });
          return;
        }
      } else {
        setTriesLeft(2);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendMfaCode = async () => {
    try {
      setIsLoadingResend(true);
      await sendMfaToken.mutateAsync({ email });
      setIsLoadingResend(false);
    } catch (err) {
      console.error(err);
      setIsLoadingResend(false);
    }
  };

  const handleWebAuthnVerification = async () => {
    setIsLoading(true);
    const mfaToken = getMfaTempToken();

    try {
      SecurityClient.setMfaToken("");

      // Get authentication options from server
      const options = await generateWebAuthnAuthenticationOptions();

      // Prompt user to authenticate with their passkey
      const authenticationResponse = await startAuthentication({ optionsJSON: options });

      // Verify with server
      const result = await verifyWebAuthnAuthentication({ authenticationResponse });

      // Use the sessionToken to verify MFA
      if (result.sessionToken) {
        SecurityClient.setMfaToken(mfaToken);
        const mfaResult = await verifyMfaToken({
          email,
          mfaCode: result.sessionToken,
          mfaMethod: MfaMethod.WEBAUTHN
        });

        SecurityClient.setMfaToken("");
        SecurityClient.setToken(mfaResult.token);

        await successCallback();
        if (closeMfa) {
          closeMfa();
        }
      }
    } catch (error: any) {
      console.error("WebAuthn verification failed:", error);

      let errorMessage = "Failed to verify passkey";
      if (error.name === "NotAllowedError") {
        errorMessage = "Passkey verification was cancelled or timed out";
      } else if (error.message) {
        errorMessage = error.message;
      }

      SecurityClient.setMfaToken(mfaToken);

      createNotification({
        text: errorMessage,
        type: "error"
      });

      if (typeof triesLeft === "number") {
        const newTriesLeft = triesLeft - 1;
        setTriesLeft(newTriesLeft);
        if (newTriesLeft <= 0) {
          createNotification({
            text: "User is temporary locked due to multiple failed login attempts. Try again later.",
            type: "error"
          });
          SecurityClient.setMfaToken("");
          SecurityClient.setToken("");
          SecurityClient.setSignupToken("");
          await logout.mutateAsync();
          navigate({ to: "/login" });
          return;
        }
      } else {
        setTriesLeft(2);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterPasskey = async () => {
    try {
      setIsRegisteringPasskey(true);

      // Check if WebAuthn is supported
      if (
        !window.PublicKeyCredential ||
        !window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable
      ) {
        createNotification({
          text: "WebAuthn is not supported on this browser",
          type: "error"
        });
        return;
      }

      // Check if platform authenticator is available
      const available =
        await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (!available) {
        createNotification({
          text: "No passkey-compatible authenticator found on this device",
          type: "error"
        });
        return;
      }

      // Temporarily clear MFA token so the regular access token is used for registration endpoints
      const mfaToken = getMfaTempToken();
      SecurityClient.setMfaToken("");

      try {
        // Generate registration options from server (using regular user endpoint)
        const options = await generateRegistrationOptions.mutateAsync();
        const registrationResponse = await startRegistration({ optionsJSON: options });

        // Verify registration with server (using regular user endpoint)
        await verifyRegistration.mutateAsync({
          registrationResponse,
          name: credentialName || "Passkey"
        });

        createNotification({
          text: "Successfully registered passkey",
          type: "success"
        });

        setShouldShowWebAuthnRegistration(false);
        await successCallback();
      } finally {
        // Restore MFA token
        SecurityClient.setMfaToken(mfaToken);
      }
    } catch (error: any) {
      console.error("Failed to register passkey:", error);

      let errorMessage = "Failed to register passkey";
      if (error.name === "NotAllowedError") {
        errorMessage = "Passkey registration was cancelled or timed out";
      } else if (error.name === "InvalidStateError") {
        errorMessage = "This passkey has already been registered";
      } else if (error.message) {
        errorMessage = error.message;
      }

      createNotification({
        text: errorMessage,
        type: "error"
      });
    } finally {
      setIsRegisteringPasskey(false);
    }
  };

  if (shouldShowTotpRegistration) {
    return (
      <>
        <div className="mb-6 text-center text-lg font-bold text-white">
          Your organization requires mobile authentication to be configured.
        </div>
        <div className="mx-auto w-max pt-4 pb-4 md:mb-16 md:px-8">
          <TotpRegistration
            shouldCenterQr
            onComplete={async () => {
              setShouldShowTotpRegistration(false);
              await successCallback();
            }}
          />
        </div>
      </>
    );
  }

  if (shouldShowWebAuthnRegistration) {
    return (
      <>
        <div className="mb-6 text-center text-lg font-bold text-white">
          Your organization requires passkey authentication to be configured.
        </div>
        <div className="mx-auto w-max pt-4 pb-4 md:mb-16 md:px-8">
          <div className="flex max-w-lg flex-col text-bunker-200">
            <div className="mb-8">
              1. Click the button below to register your passkey. You&apos;ll be prompted to use
              your device&apos;s biometric authentication (Touch ID, Face ID, Windows Hello, etc.).
            </div>
            <div className="mb-4">2. Optionally, give your passkey a name to identify it later</div>
            <div className="mb-4 flex flex-col gap-2">
              <Input
                onChange={(e) => setCredentialName(e.target.value)}
                value={credentialName}
                placeholder="Passkey name (optional)"
              />
              <Button onClick={handleRegisterPasskey} isLoading={isRegisteringPasskey}>
                Register Passkey
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="mx-auto w-max pt-6 pb-6 md:mb-16 md:px-8">
      {!hideLogo && (
        <Link to="/">
          <div className="mb-4 flex justify-center">
            <img src="/images/gradientLogo.svg" height={90} width={120} alt="Infisical logo" />
          </div>
        </Link>
      )}
      {method === MfaMethod.EMAIL && (
        <>
          <p className="text-l flex justify-center text-bunker-300">{t("mfa.step2-message")}</p>
          <p className="text-l my-1 flex justify-center font-medium text-bunker-300">{email}</p>
        </>
      )}
      {method === MfaMethod.TOTP && (
        <div className="mb-8 text-center">
          <h2 className="mb-3 text-xl font-medium text-bunker-100">Two-Factor Authentication</h2>
          <p className="mx-auto max-w-md text-sm leading-relaxed text-bunker-300">
            {showRecoveryCodeInput
              ? "Enter one of your backup recovery codes"
              : "Enter the verification code from your authenticator app"}
          </p>
        </div>
      )}
      {method === MfaMethod.WEBAUTHN && (
        <div className="mb-8 text-center">
          <h2 className="mb-3 text-xl font-medium text-bunker-100">Passkey Authentication</h2>
          <p className="mx-auto max-w-md text-sm leading-relaxed text-bunker-300">
            Use your registered passkey to complete two-factor authentication
          </p>
        </div>
      )}
      {method === MfaMethod.WEBAUTHN ? (
        <>
          {typeof triesLeft === "number" && (
            <Error text={`Failed authentication. You have ${triesLeft} attempt(s) remaining.`} />
          )}
          <div className="mx-auto mt-6 flex w-full max-w-sm flex-col items-center justify-center text-center">
            <Button
              size="md"
              onClick={handleWebAuthnVerification}
              isFullWidth
              className="h-11 rounded-lg font-medium shadow-xs transition-all duration-200 hover:shadow-md"
              colorSchema="primary"
              variant="outline_bg"
              isLoading={isLoading}
              isDisabled={typeof triesLeft === "number" && triesLeft <= 0}
            >
              Authenticate with Passkey
            </Button>
          </div>
        </>
      ) : (
        <form onSubmit={verifyMfa}>
          <div className="mx-auto hidden md:block" style={{ minWidth: "600px" }}>
            {method === MfaMethod.EMAIL && (
              <div className="flex justify-center">
                <ReactCodeInput
                  name=""
                  inputMode="tel"
                  type="text"
                  fields={6}
                  onChange={setMfaCode}
                  className="mt-6 mb-2"
                  {...codeInputProps}
                />
              </div>
            )}
            {method === MfaMethod.TOTP && (
              <div className="mt-8 mb-6 flex justify-center">
                <ReactCodeInput
                  key={showRecoveryCodeInput ? "recovery" : "totp"}
                  name=""
                  inputMode="tel"
                  type="text"
                  fields={showRecoveryCodeInput ? 8 : 6}
                  onChange={setMfaCode}
                  className="mb-2"
                  {...codeInputProps}
                />
              </div>
            )}
          </div>
          <div className="mx-auto mt-4 block md:hidden" style={{ minWidth: "400px" }}>
            {method === MfaMethod.EMAIL && (
              <div className="flex justify-center">
                <ReactCodeInput
                  name=""
                  inputMode="tel"
                  type="text"
                  fields={6}
                  onChange={setMfaCode}
                  className="mt-2 mb-2"
                  {...codeInputPropsPhone}
                />
              </div>
            )}
            {method === MfaMethod.TOTP && (
              <div className="mt-4 mb-6 flex justify-center">
                <ReactCodeInput
                  key={showRecoveryCodeInput ? "recovery-mobile" : "totp-mobile"}
                  name=""
                  inputMode="tel"
                  type="text"
                  fields={showRecoveryCodeInput ? 8 : 6}
                  onChange={setMfaCode}
                  className="mb-2"
                  {...codeInputPropsPhone}
                />
              </div>
            )}
          </div>
          {typeof triesLeft === "number" && (
            <Error text={`Invalid code. You have ${triesLeft} attempt(s) remaining.`} />
          )}
          <div className="mx-auto mt-6 flex w-full max-w-sm flex-col items-center justify-center text-center">
            <Button
              size="md"
              type="submit"
              isFullWidth
              className="h-11 rounded-lg font-medium shadow-xs transition-all duration-200 hover:shadow-md"
              colorSchema="primary"
              variant="outline_bg"
              isLoading={isLoading}
              isDisabled={!isCodeComplete || (typeof triesLeft === "number" && triesLeft <= 0)}
            >
              {String(t("mfa.verify"))}
            </Button>
          </div>
        </form>
      )}
      {method === MfaMethod.TOTP && (
        <div className="mt-6 flex flex-col items-center gap-4 text-sm">
          <button
            type="button"
            onClick={() => {
              setShowRecoveryCodeInput(!showRecoveryCodeInput);
              setMfaCode("");
            }}
            className="text-bunker-400 transition-colors duration-200 hover:text-bunker-200 hover:underline hover:decoration-primary-700 hover:underline-offset-4"
          >
            {showRecoveryCodeInput ? "Use authenticator code" : "Use a recovery code"}
          </button>
          <div className="text-center text-sm">
            <Tooltip
              position="bottom"
              content={
                <div className="max-w-xs text-center text-xs">
                  {isInfisicalCloud() ? (
                    <>
                      <div className="mb-2">Account Recovery Required</div>
                      <div className="mb-2 text-gray-300">
                        Contact support with valid proof of account ownership to initiate recovery
                      </div>
                      <div className="mt-1">support@infisical.com</div>
                    </>
                  ) : (
                    <>
                      <div className="mb-2">Account Recovery Required</div>
                      <div className="text-gray-300">
                        Contact your instance administrator with valid proof of account ownership to
                        initiate recovery
                      </div>
                    </>
                  )}
                </div>
              }
            >
              <span className="cursor-help text-bunker-400 transition-colors duration-200 hover:text-bunker-200">
                Lost your recovery codes?
              </span>
            </Tooltip>
          </div>
        </div>
      )}
      {method === MfaMethod.EMAIL && (
        <div className="mx-auto flex max-h-24 w-full max-w-md flex-col items-center justify-center pt-2">
          <div className="flex flex-row items-baseline gap-1 text-sm">
            <span className="text-bunker-400">{t("signup.step2-resend-alert")}</span>
            <div className="text-md mt-2 flex flex-row text-bunker-400">
              <button disabled={isLoadingResend} onClick={handleResendMfaCode} type="button">
                <span className="cursor-pointer duration-200 hover:text-bunker-200 hover:underline hover:decoration-primary-700 hover:underline-offset-4">
                  {isLoadingResend
                    ? t("signup.step2-resend-progress")
                    : t("signup.step2-resend-submit")}
                </span>
              </button>
            </div>
          </div>
          <p className="pb-2 text-sm text-bunker-400">{t("signup.step2-spam-alert")}</p>
        </div>
      )}
    </div>
  );
};
