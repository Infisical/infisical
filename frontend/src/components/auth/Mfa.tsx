import { useEffect, useRef, useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { Link, useNavigate } from "@tanstack/react-router";
import { t } from "i18next";

import Error from "@app/components/basic/Error";
import { MfaEnrollment } from "@app/components/mfa/MfaEnrollment";
import { createNotification } from "@app/components/notifications";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { Tooltip } from "@app/components/v2";
import { Button, VerificationCodeForm, VerificationCodeHeader } from "@app/components/v3";
import { isInfisicalCloud } from "@app/helpers/platform";
import { useActivateMfa, useLogoutUser, useSendMfaToken } from "@app/hooks/api";
import {
  checkUserTotpMfa,
  checkUserWebAuthnMfa,
  verifyMfaToken,
  verifyRecoveryCode
} from "@app/hooks/api/auth/queries";
import { MfaMethod } from "@app/hooks/api/auth/types";
import { getMfaTempToken } from "@app/hooks/api/reactQuery";
import { fetchUserDetails } from "@app/hooks/api/users/queries";
import { useGenerateAuthenticationOptions, useVerifyAuthentication } from "@app/hooks/api/webauthn";

import { RecoveryCodesStep } from "../mfa/setup";

const MAX_MFA_ATTEMPTS = 5;

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
  const [newRecoveryCodes, setNewRecoveryCodes] = useState<string[] | null>(null);
  const [hasSavedRecoveryCodes, setHasSavedRecoveryCodes] = useState(false);
  const wasMfaEnabledRef = useRef(true);
  const { mutateAsync: activateMfa } = useActivateMfa();
  const logout = useLogoutUser();

  const { mutateAsync: generateWebAuthnAuthenticationOptions } = useGenerateAuthenticationOptions();
  const { mutateAsync: verifyWebAuthnAuthentication } = useVerifyAuthentication();

  const sendMfaToken = useSendMfaToken();

  useEffect(() => {
    fetchUserDetails()
      .then((user) => {
        wasMfaEnabledRef.current = Boolean(user.isMfaEnabled);
      })
      .catch(() => {
        // Keep the safe default (treat as enabled) so existing codes are never rotated.
      });

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
    // Recovery codes are account-level and 8 characters for every MFA method
    // (email, TOTP and passkeys).
    if (showRecoveryCodeInput) return 8;
    return 6;
  };

  const isCodeComplete = mfaCode.length === getExpectedCodeLength();

  const getRecoveryToggleLabel = () => {
    if (!showRecoveryCodeInput) return "Use a recovery code";
    if (method === MfaMethod.WEBAUTHN) return "Use passkey instead";
    if (method === MfaMethod.EMAIL) return "Use email code";
    return "Use authenticator code";
  };

  const completeLogin = async () => {
    await successCallback();
    if (closeMfa) {
      closeMfa();
    }
  };

  // Runs only after MFA verification has already succeeded: the MFA token is consumed
  // and a real session token is issued. Enabling MFA + minting recovery codes is a
  // distinct follow-up step and must NOT share the verification's error handling — if
  // it fails, the user's code was still accepted, so bouncing them back to the code
  // entry (where resubmitting a consumed code can never work) or decrementing the retry
  // counter would trap them. On failure we surface a dedicated message and let them
  // proceed; recovery codes can be generated later from account security settings.
  const finalizeAfterMfaVerification = async (
    sessionToken: string,
    mfaMethod: MfaMethod,
    isRecoveryCodeFlow: boolean
  ) => {
    SecurityClient.setMfaToken("");
    SecurityClient.setToken(sessionToken);

    if (!isRecoveryCodeFlow && !wasMfaEnabledRef.current) {
      try {
        const { recoveryCodes } = await activateMfa({ selectedMfaMethod: mfaMethod });
        setNewRecoveryCodes(recoveryCodes);
        return;
      } catch {
        createNotification({
          text: "Your identity was verified, but two-factor setup couldn't be completed. You can set up recovery codes later from your account security settings.",
          type: "error"
        });
      }
    }

    await completeLogin();
  };

  const verifyMfa = async () => {
    if (!mfaCode.trim() || !isCodeComplete) return;

    setIsLoading(true);

    let sessionToken: string;
    try {
      const result = showRecoveryCodeInput
        ? await verifyRecoveryCode(mfaCode.trim())
        : await verifyMfaToken({
            email,
            mfaCode: mfaCode.trim(),
            mfaMethod: method
          });
      sessionToken = result.token;
    } catch {
      if (typeof triesLeft === "number") {
        const newTriesLeft = triesLeft - 1;
        setTriesLeft(newTriesLeft);
        if (newTriesLeft <= 0) {
          createNotification({
            text: "User is temporary locked due to multiple failed login attempts. Try again later. You can also reset your password now to proceed.",
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
        setTriesLeft(MAX_MFA_ATTEMPTS - 1);
      }
      setIsLoading(false);
      return;
    }

    try {
      await finalizeAfterMfaVerification(sessionToken, method, showRecoveryCodeInput);
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

    let sessionToken: string;
    try {
      SecurityClient.setMfaToken("");

      // Get authentication options from server
      const options = await generateWebAuthnAuthenticationOptions();

      // Prompt user to authenticate with their passkey
      const authenticationResponse = await startAuthentication({ optionsJSON: options });

      // Verify with server
      const result = await verifyWebAuthnAuthentication({ authenticationResponse });

      // Nothing to verify against without a session token; bail out without counting
      // this as a failed attempt.
      if (!result.sessionToken) {
        setIsLoading(false);
        return;
      }

      // Use the sessionToken to verify MFA
      SecurityClient.setMfaToken(mfaToken);
      const mfaResult = await verifyMfaToken({
        email,
        mfaCode: result.sessionToken,
        mfaMethod: MfaMethod.WEBAUTHN
      });
      sessionToken = mfaResult.token;
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
        setTriesLeft(MAX_MFA_ATTEMPTS - 1);
      }
      setIsLoading(false);
      return;
    }

    try {
      await finalizeAfterMfaVerification(sessionToken, MfaMethod.WEBAUTHN, false);
    } finally {
      setIsLoading(false);
    }
  };

  if (newRecoveryCodes) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-col gap-4 pt-4 pb-4 md:mb-16 md:px-8">
        <RecoveryCodesStep
          recoveryCodes={newRecoveryCodes}
          acknowledgment={{
            isAcknowledged: hasSavedRecoveryCodes,
            onAcknowledgedChange: setHasSavedRecoveryCodes,
            confirmLabel: "Continue",
            isConfirmPending: isLoading,
            labelClassName: "text-bunker-200",
            onConfirm: async () => {
              setIsLoading(true);
              await completeLogin();
            }
          }}
        />
      </div>
    );
  }

  if (shouldShowTotpRegistration || shouldShowWebAuthnRegistration) {
    return (
      <div className="mx-auto w-max pt-4 pb-4 md:mb-16 md:px-8">
        <MfaEnrollment
          method={method}
          onComplete={async () => {
            setShouldShowTotpRegistration(false);
            setShouldShowWebAuthnRegistration(false);
            await successCallback();
          }}
        />
      </div>
    );
  }

  let headerTitle = "Two-factor authentication";
  let headerDescription: string | undefined;
  let headerRecipient: string | undefined;

  if (showRecoveryCodeInput) {
    headerDescription = "Enter one of your backup recovery codes.";
  } else if (method === MfaMethod.EMAIL) {
    headerTitle = String(t("mfa.step2-message"));
    headerRecipient = email;
  } else if (method === MfaMethod.TOTP) {
    headerDescription = "Enter the verification code from your authenticator app.";
  } else if (method === MfaMethod.WEBAUTHN) {
    headerTitle = "Passkey authentication";
    headerDescription = "Use your registered passkey to continue.";
  }

  return (
    <div className="mx-auto w-full max-w-xl pt-6 pb-6 md:mb-16 md:px-8">
      {!hideLogo && (
        <Link to="/">
          <div className="mb-4 flex justify-center">
            <img src="/images/gradientLogo.svg" height={90} width={120} alt="Infisical logo" />
          </div>
        </Link>
      )}
      <VerificationCodeHeader
        title={headerTitle}
        recipient={headerRecipient}
        description={headerDescription}
      />
      {method === MfaMethod.WEBAUTHN && !showRecoveryCodeInput ? (
        <>
          {typeof triesLeft === "number" && (
            <Error text={`Failed authentication. You have ${triesLeft} attempt(s) remaining.`} />
          )}
          <div className="mx-auto mt-6 flex w-full max-w-sm flex-col items-center justify-center text-center">
            <Button
              size="lg"
              onClick={handleWebAuthnVerification}
              isFullWidth
              variant="project"
              isPending={isLoading}
              isDisabled={typeof triesLeft === "number" && triesLeft <= 0}
            >
              Authenticate with passkey
            </Button>
          </div>
        </>
      ) : (
        <VerificationCodeForm
          key={showRecoveryCodeInput ? "recovery" : method}
          name="mfa-code"
          fields={showRecoveryCodeInput ? 8 : 6}
          value={mfaCode}
          onChange={setMfaCode}
          onSubmit={verifyMfa}
          submitLabel={String(t("mfa.verify"))}
          isPending={isLoading}
          isDisabled={typeof triesLeft === "number" && triesLeft <= 0}
          error={
            typeof triesLeft === "number"
              ? `Invalid code. You have ${triesLeft} attempt(s) remaining.`
              : undefined
          }
        />
      )}
      {method === MfaMethod.EMAIL && !showRecoveryCodeInput && (
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
      {(method === MfaMethod.EMAIL ||
        method === MfaMethod.TOTP ||
        method === MfaMethod.WEBAUTHN) && (
        <div className="mt-6 flex flex-col items-center gap-4 text-sm">
          <button
            type="button"
            onClick={() => {
              setShowRecoveryCodeInput(!showRecoveryCodeInput);
              setMfaCode("");
            }}
            className="text-bunker-400 transition-colors duration-200 hover:text-bunker-200 hover:underline hover:decoration-primary-700 hover:underline-offset-4"
          >
            {getRecoveryToggleLabel()}
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
    </div>
  );
};
