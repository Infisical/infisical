import React, { useEffect, useState } from "react";
import ReactCodeInput from "react-code-input";
import { Link, useNavigate } from "@tanstack/react-router";
import { t } from "i18next";

import Error from "@app/components/basic/Error";
import TotpRegistration from "@app/components/mfa/TotpRegistration";
import { createNotification } from "@app/components/notifications";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { Button, Tooltip } from "@app/components/v2";
import { isInfisicalCloud } from "@app/helpers/platform";
import { useLogoutUser, useSendMfaToken } from "@app/hooks/api";
import { checkUserTotpMfa, verifyMfaToken, verifyRecoveryCode } from "@app/hooks/api/auth/queries";
import { MfaMethod } from "@app/hooks/api/auth/types";

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
  const logout = useLogoutUser(true);

  const sendMfaToken = useSendMfaToken();

  useEffect(() => {
    if (method === MfaMethod.TOTP) {
      checkUserTotpMfa().then((isVerified) => {
        if (!isVerified) {
          SecurityClient.setMfaToken("");
          setShouldShowTotpRegistration(true);
        }
      });
    }
  }, []);

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
            text: "User is temporary locked due to multiple failed login attempts. Try again after 5 minutes. You can also reset your password now to proceed.",
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

  if (shouldShowTotpRegistration) {
    return (
      <>
        <div className="mb-6 text-center text-lg font-bold text-white">
          Your organization requires mobile authentication to be configured.
        </div>
        <div className="mx-auto w-max pb-4 pt-4 md:mb-16 md:px-8">
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

  return (
    <div className="mx-auto w-max pb-6 pt-6 md:mb-16 md:px-8">
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
          <p className="text-l my-1 flex justify-center font-semibold text-bunker-300">{email}</p>
        </>
      )}
      {method === MfaMethod.TOTP && (
        <div className="mb-8 text-center">
          <h2 className="mb-3 text-xl font-semibold text-bunker-100">Two-Factor Authentication</h2>
          <p className="mx-auto max-w-md text-sm leading-relaxed text-bunker-300">
            {showRecoveryCodeInput
              ? "Enter one of your backup recovery codes"
              : "Enter the verification code from your authenticator app"}
          </p>
        </div>
      )}
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
                className="mb-2 mt-6"
                {...codeInputProps}
              />
            </div>
          )}
          {method === MfaMethod.TOTP && (
            <div className="mb-6 mt-8 flex justify-center">
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
                className="mb-2 mt-2"
                {...codeInputPropsPhone}
              />
            </div>
          )}
          {method === MfaMethod.TOTP && (
            <div className="mb-6 mt-4 flex justify-center">
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
            className="h-11 rounded-lg font-medium shadow-sm transition-all duration-200 hover:shadow-md"
            colorSchema="primary"
            variant="outline_bg"
            isLoading={isLoading}
            isDisabled={!isCodeComplete || (typeof triesLeft === "number" && triesLeft <= 0)}
          >
            {String(t("mfa.verify"))}
          </Button>
        </div>
      </form>
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
