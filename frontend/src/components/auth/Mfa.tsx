import React, { useEffect, useState } from "react";
import ReactCodeInput from "react-code-input";
import { Link, useNavigate } from "@tanstack/react-router";
import { t } from "i18next";

import Error from "@app/components/basic/Error";
import TotpRegistration from "@app/components/mfa/TotpRegistration";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { Button, Input } from "@app/components/v2";
import { useSendMfaToken } from "@app/hooks/api";
import { checkUserTotpMfa, verifyMfaToken } from "@app/hooks/api/auth/queries";
import { MfaMethod } from "@app/hooks/api/auth/types";

// The style for the verification code input
const codeInputProps = {
  inputStyle: {
    fontFamily: "monospace",
    margin: "4px",
    MozAppearance: "textfield",
    width: "48px",
    borderRadius: "5px",
    fontSize: "24px",
    height: "48px",
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
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingResend, setIsLoadingResend] = useState(false);
  const [triesLeft, setTriesLeft] = useState<number | undefined>(undefined);
  const [shouldShowTotpRegistration, setShouldShowTotpRegistration] = useState(false);

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

  const verifyMfa = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setIsLoading(true);
    try {
      const { token } = await verifyMfaToken({
        email,
        mfaCode,
        mfaMethod: method
      });

      SecurityClient.setMfaToken("");
      SecurityClient.setToken(token);

      await successCallback();
      if (closeMfa) {
        closeMfa();
      }
    } catch {
      if (triesLeft) {
        setTriesLeft((left) => {
          if (triesLeft === 1) {
            navigate({ to: "/" });

            SecurityClient.setMfaToken("");
            SecurityClient.setToken("");
          }
          return (left as number) - 1;
        });
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
    <div className="mx-auto w-max pb-4 pt-4 md:mb-16 md:px-8">
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
        <>
          <p className="text-l mb-4 flex max-w-xs justify-center text-center font-bold text-bunker-100">
            Authenticator MFA Required
          </p>
          <p className="text-l flex max-w-xs justify-center text-center text-bunker-300">
            Open the authenticator app on your mobile device to get your verification code or enter
            a recovery code.
          </p>
        </>
      )}
      <form onSubmit={verifyMfa}>
        <div className="mx-auto hidden w-max min-w-[20rem] md:block">
          {method === MfaMethod.EMAIL && (
            <ReactCodeInput
              name=""
              inputMode="tel"
              type="text"
              fields={6}
              onChange={setMfaCode}
              className="mb-2 mt-6"
              {...codeInputProps}
            />
          )}
          {method === MfaMethod.TOTP && (
            <div className="mb-4 mt-6">
              <Input value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} />
            </div>
          )}
        </div>
        <div className="mx-auto mt-4 block w-max min-w-[18rem] md:hidden">
          {method === MfaMethod.EMAIL && (
            <ReactCodeInput
              name=""
              inputMode="tel"
              type="text"
              fields={6}
              onChange={setMfaCode}
              className="mb-2 mt-2"
              {...codeInputPropsPhone}
            />
          )}
          {method === MfaMethod.TOTP && (
            <div className="mb-4 mt-2">
              <Input value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} />
            </div>
          )}
        </div>
        {typeof triesLeft === "number" && (
          <Error text={`Invalid code. You have ${triesLeft} attempt(s) remaining.`} />
        )}
        <div className="mx-auto mt-2 flex w-1/4 min-w-[20rem] max-w-xs flex-col items-center justify-center text-center text-sm md:max-w-md md:text-left lg:w-[19%]">
          <div className="text-l w-full py-1 text-lg">
            <Button
              size="sm"
              type="submit"
              isFullWidth
              className="h-14"
              colorSchema="primary"
              variant="outline_bg"
              isLoading={isLoading}
            >
              {String(t("mfa.verify"))}
            </Button>
          </div>
        </div>
      </form>
      {method === MfaMethod.TOTP && (
        <div className="mt-2 flex flex-row justify-center text-sm text-bunker-400">
          <Link to="/verify-email">
            <span className="cursor-pointer duration-200 hover:text-bunker-200 hover:underline hover:decoration-primary-700 hover:underline-offset-4">
              Lost your recovery codes? Reset your account
            </span>
          </Link>
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
