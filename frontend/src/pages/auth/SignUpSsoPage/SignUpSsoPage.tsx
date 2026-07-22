import { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { jwtDecode } from "jwt-decode";

import { AuthPageLayout } from "@app/components/auth/AuthPageLayout";
import { AuthPagePanel } from "@app/components/auth/AuthPagePanel";
import { createNotification } from "@app/components/notifications";
import SecurityClient from "@app/components/utilities/SecurityClient";
import {
  Button,
  CardContent,
  VerificationCodeForm,
  VerificationCodeHeader
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { isInfisicalCloud } from "@app/helpers/platform";
import { getHubSpotUtk } from "@app/helpers/utmTracking";
import { useSendEmailVerificationCode } from "@app/hooks/api";
import { useCompleteAccountSignup } from "@app/hooks/api/auth/queries";

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
    <AuthPageLayout
      headerAction={
        <Button asChild variant="outline" size="sm">
          <Link to="/login">Log In</Link>
        </Button>
      }
    >
      <Helmet>
        <title>{t("common.head-title", { title: t("signup.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={t("signup.og-title") as string} />
        <meta name="og:description" content={t("signup.og-description") as string} />
      </Helmet>
      <div className="mx-auto flex w-full flex-col items-center justify-center">
        <AuthPagePanel>
          <VerificationCodeHeader
            title="We've sent a verification code to"
            recipient={decoded.email}
          />
          <CardContent>
            <VerificationCodeForm
              name="signup-sso-verification-code"
              value={code}
              onChange={setCode}
              onSubmit={handleSubmit}
              isPending={completeAccountSignup.isPending}
              error={
                completeAccountSignup.isError
                  ? "Oops. Your code is wrong. Please try again."
                  : undefined
              }
            >
              <div className="flex flex-col items-center gap-2 text-xs text-label">
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
            </VerificationCodeForm>
          </CardContent>
        </AuthPagePanel>
      </div>
    </AuthPageLayout>
  );
};
