import { useEffect, useState } from "react";
import ReactCodeInput from "react-code-input";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { jwtDecode } from "jwt-decode";

import { AuthPageBackground } from "@app/components/auth/AuthPageBackground";
import { AuthPageFooter } from "@app/components/auth/AuthPageFooter";
import { AuthPageHeader } from "@app/components/auth/AuthPageHeader";
import { createNotification } from "@app/components/notifications";
import SecurityClient from "@app/components/utilities/SecurityClient";
import {
  Button,
  FieldError,
  UnstableCard,
  UnstableCardContent,
  UnstableCardHeader,
  UnstableCardTitle
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { isInfisicalCloud } from "@app/helpers/platform";
import { getHubSpotUtk } from "@app/helpers/utmTracking";
import { useSendEmailVerificationCode } from "@app/hooks/api";
import { useCompleteAccountSignup } from "@app/hooks/api/auth/queries";

const codeInputStyle = {
  inputStyle: {
    fontFamily: "monospace",
    margin: "4px",
    MozAppearance: "textfield",
    width: "55px",
    borderRadius: "6px",
    fontSize: "24px",
    height: "55px",
    paddingLeft: "7",
    backgroundColor: "transparent",
    color: "#ebebeb",
    border: "1px solid #2b2c30",
    textAlign: "center",
    outlineColor: "#2d2f33",
    borderColor: "#2b2c30"
  }
} as const;

const codeInputStylePhone = {
  inputStyle: {
    fontFamily: "monospace",
    margin: "4px",
    MozAppearance: "textfield",
    width: "40px",
    borderRadius: "6px",
    fontSize: "24px",
    height: "40px",
    paddingLeft: "7",
    backgroundColor: "transparent",
    color: "#ebebeb",
    border: "1px solid #2b2c30",
    textAlign: "center",
    outlineColor: "#2d2f33",
    borderColor: "#2b2c30"
  }
} as const;

export const SignupSsoPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const search = useSearch({ from: ROUTE_PATHS.Auth.SignUpSsoPage.id });
  const token = search.token as string;

  const [code, setCode] = useState("");

  const completeAccountSignup = useCompleteAccountSignup();

  const decoded = jwtDecode(token) as {
    email?: string;
    firstName?: string;
    lastName?: string;
    authMethod?: string;
    isEmailVerified?: boolean;
  };

  const { mutateAsync: sendEmailVerificationCode } = useSendEmailVerificationCode();

  useEffect(() => {
    SecurityClient.setSignupToken(token);
  }, [token]);

  const handleSubmit = async () => {
    const { token: accessToken } = await completeAccountSignup.mutateAsync({
      type: "alias",
      code,
      hubspotUtk: getHubSpotUtk()
    });

    SecurityClient.setSignupToken("");
    SecurityClient.setToken(accessToken);
    const { organizationId } = jwtDecode(accessToken) as { organizationId?: string };

    if (isInfisicalCloud()) {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: "signup_completed" });
    }

    createNotification({
      text: "Successfully verified",
      type: "success"
    });
    if (organizationId) {
      navigate({
        to: "/organizations/$orgId/projects",
        params: { orgId: organizationId }
      });
    } else {
      navigate({ to: "/login/select-organization" });
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
    <div className="relative flex max-h-screen min-h-screen flex-col overflow-y-auto bg-linear-to-tr from-card via-bunker-900 to-card px-4">
      <AuthPageBackground />
      <Helmet>
        <title>{t("common.head-title", { title: t("signup.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={t("signup.og-title") as string} />
        <meta name="og:description" content={t("signup.og-description") as string} />
      </Helmet>
      <AuthPageHeader>
        <Button asChild>
          <Link to="/login">Log In</Link>
        </Button>
      </AuthPageHeader>
      <div className="relative z-10 my-auto flex flex-col items-center py-10">
        <form className="w-full" onSubmit={(e) => e.preventDefault()}>
          <div className="mx-auto flex w-full flex-col items-center justify-center">
            <UnstableCard className="mx-auto w-full max-w-md items-stretch gap-0 p-6">
              <UnstableCardHeader className="mb-2 gap-2">
                <UnstableCardTitle className="bg-linear-to-b from-white to-bunker-200 bg-clip-text text-center text-[1.55rem] font-medium text-transparent">
                  We&apos;ve sent a verification code to
                </UnstableCardTitle>
              </UnstableCardHeader>
              <UnstableCardContent>
                <p className="text-md my-1 flex justify-center font-medium text-foreground">
                  {decoded.email}
                </p>
                <div className="mx-auto hidden w-max min-w-[20rem] md:block">
                  <ReactCodeInput
                    name=""
                    inputMode="tel"
                    type="text"
                    fields={6}
                    onChange={setCode}
                    {...codeInputStyle}
                    className="code-input-v3 mt-6 mb-2"
                  />
                </div>
                <div className="mx-auto mt-4 block w-max md:hidden">
                  <ReactCodeInput
                    name=""
                    inputMode="tel"
                    type="text"
                    fields={6}
                    onChange={setCode}
                    {...codeInputStylePhone}
                    className="code-input-v3 mt-2 mb-2"
                  />
                </div>
                {completeAccountSignup.isError && (
                  <FieldError>Oops. Your code is wrong. Please try again.</FieldError>
                )}
                <div className="mt-4 w-full">
                  <Button
                    type="submit"
                    onClick={handleSubmit}
                    variant="project"
                    size="lg"
                    isFullWidth
                    isPending={completeAccountSignup.isPending}
                    isDisabled={completeAccountSignup.isPending}
                  >
                    Verify
                  </Button>
                </div>
                <div className="mt-6 flex flex-col items-center gap-2 text-xs text-label">
                  <div className="flex flex-row items-baseline gap-1">
                    <button
                      disabled={completeAccountSignup.isPending}
                      onClick={handleResendCode}
                      type="button"
                    >
                      <span className="cursor-pointer duration-200 hover:text-foreground hover:underline hover:decoration-project/45 hover:underline-offset-2">
                        Don&apos;t see the code? Resend
                      </span>
                    </button>
                  </div>
                  <p className="text-label">Make sure to check your spam inbox.</p>
                </div>
              </UnstableCardContent>
            </UnstableCard>
          </div>
        </form>
      </div>
      <AuthPageFooter />
    </div>
  );
};
