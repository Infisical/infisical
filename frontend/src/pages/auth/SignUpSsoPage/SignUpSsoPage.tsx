import { useState } from "react";
import ReactCodeInput from "react-code-input";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { jwtDecode } from "jwt-decode";

import Error from "@app/components/basic/Error";
import { AuthPageBackground } from "@app/components/auth/AuthPageBackground";
import { AuthPageFooter } from "@app/components/auth/AuthPageFooter";
import { createNotification } from "@app/components/notifications";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { Button } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { useSendEmailVerificationCode } from "@app/hooks/api";
import { verifyAlias } from "@app/hooks/api/auth/queries";

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

export const SignupSsoPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const search = useSearch({ from: ROUTE_PATHS.Auth.SignUpSsoPage.id });
  const token = search.token as string;

  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const decoded = jwtDecode(token) as {
    email?: string;
    firstName?: string;
    lastName?: string;
    authMethod?: string;
    isEmailVerified?: boolean;
    isAliasVerified?: boolean;
    organizationId?: string;
  };

  // Store the signup token so the Axios interceptor uses it for Authorization headers
  SecurityClient.setSignupToken(token);

  const { mutateAsync: sendEmailVerificationCode } = useSendEmailVerificationCode();

  const handleVerify = async () => {
    setIsLoading(true);
    try {
      const { accessToken, refreshToken } = await verifyAlias({ code });

      setCodeError(false);
      SecurityClient.setSignupToken("");
      SecurityClient.setToken(accessToken);

      createNotification({
        text: "Successfully verified",
        type: "success"
      });

      // refreshToken is set as jid cookie by the backend response
      // Navigate to org selection
      void refreshToken; // used by backend cookie, not needed here
      navigate({ to: "/login/select-organization" });
    } catch {
      setCodeError(true);
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    try {
      await sendEmailVerificationCode(token);
      createNotification({
        text: "Successfully resent code",
        type: "success"
      });
    } catch {
      createNotification({
        text: "Failed to resend code",
        type: "error"
      });
    }
  };

  return (
    <div className="relative flex max-h-screen min-h-screen flex-col overflow-y-auto bg-linear-to-tr from-card via-bunker-900 to-card px-6">
      <AuthPageBackground />
      <Helmet>
        <title>{t("common.head-title", { title: t("signup.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={t("signup.og-title") as string} />
        <meta name="og:description" content={t("signup.og-description") as string} />
      </Helmet>
      <div className="relative z-10 my-auto flex flex-col items-center py-10">
        <Link to="/">
          <div className="mb-4 flex justify-center">
            <img
              src="/images/gradientLogo.svg"
              style={{ height: "90px", width: "120px" }}
              alt="Infisical logo"
            />
          </div>
        </Link>
        <div className="mx-auto h-full w-full pb-4 md:px-8">
          <p className="text-md flex justify-center text-bunker-200">
            We&apos;ve sent a verification code to {decoded.email}
          </p>
          <div className="mx-auto hidden w-max min-w-[20rem] md:block">
            <ReactCodeInput
              name=""
              inputMode="tel"
              type="text"
              fields={6}
              onChange={setCode}
              {...codeInputProps}
              className="mt-6 mb-2"
            />
          </div>
          <div className="mx-auto mt-4 block w-max md:hidden">
            <ReactCodeInput
              name=""
              inputMode="tel"
              type="text"
              fields={6}
              onChange={setCode}
              {...codeInputPropsPhone}
              className="mt-2 mb-2"
            />
          </div>
          {codeError && <Error text="Oops. Your code is wrong. Please try again." />}
          <div className="mx-auto mt-2 flex w-1/4 max-w-xs min-w-[20rem] flex-col items-center justify-center text-center text-sm md:max-w-md md:text-left lg:w-[19%]">
            <div className="text-l w-full py-1 text-lg">
              <Button
                type="submit"
                onClick={handleVerify}
                size="sm"
                isFullWidth
                className="h-14"
                colorSchema="primary"
                variant="outline_bg"
                isLoading={isLoading}
              >
                Verify
              </Button>
            </div>
          </div>
          <div className="mx-auto flex max-h-24 w-full max-w-md flex-col items-center justify-center pt-2">
            <div className="flex flex-row items-baseline gap-1 text-sm">
              <span className="text-bunker-400">Don&apos;t see the code?</span>
              <div className="text-md mt-2 flex flex-row text-bunker-400">
                <button disabled={isLoading} onClick={handleResendCode} type="button">
                  <span className="cursor-pointer duration-200 hover:text-bunker-200 hover:underline hover:decoration-primary-700 hover:underline-offset-4">
                    Resend
                  </span>
                </button>
              </div>
            </div>
            <p className="pb-2 text-sm text-bunker-400">Make sure to check your spam inbox.</p>
          </div>
        </div>
      </div>
      <AuthPageFooter />
    </div>
  );
};
