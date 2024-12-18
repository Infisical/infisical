import { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { createFileRoute, useSearch } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { jwtDecode } from "jwt-decode";
import { z } from "zod";

import { BackupPDFStep } from "./-components/BackupPDFStep";
import { EmailConfirmationStep } from "./-components/EmailConfirmationStep";
import { UserInfoSSOStep } from "./-components/UserInfoSSOStep";

const SignupSSOPage = () => {
  const { t } = useTranslation();
  const search = useSearch({ from: "/_restrict_login_signup/signup/sso/" });
  const token = search.token as string;

  const [step, setStep] = useState(0);
  const [password, setPassword] = useState("");

  const {
    username,
    email,
    organizationName,
    organizationSlug,
    firstName,
    lastName,
    authType,
    isEmailVerified
  } = jwtDecode(token) as any;

  useEffect(() => {
    if (!isEmailVerified) {
      setStep(0);
    } else {
      setStep(1);
    }
  }, []);

  const renderView = () => {
    switch (step) {
      case 0:
        return (
          <EmailConfirmationStep
            authType={authType}
            username={username}
            email={email}
            organizationSlug={organizationSlug}
            setStep={setStep}
          />
        );
      case 1:
        return (
          <UserInfoSSOStep
            username={username}
            name={`${firstName} ${lastName}`}
            providerOrganizationName={organizationName}
            password={password}
            setPassword={setPassword}
            setStep={setStep}
            providerAuthToken={token}
          />
        );
      case 2:
        return (
          <BackupPDFStep email={username} password={password} name={`${firstName} ${lastName}`} />
        );
      default:
        return <div />;
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-gradient-to-tr from-mineshaft-600 via-mineshaft-800 to-bunker-700 px-6 pb-28">
      <Helmet>
        <title>{t("common.head-title", { title: t("signup.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={t("signup.og-title") as string} />
        <meta name="og:description" content={t("signup.og-description") as string} />
      </Helmet>
      <div className="mb-4 mt-20 flex justify-center">
        <img src="/images/gradientLogo.svg" height={90} width={120} alt="Infisical Logo" />
      </div>
      <div>{renderView()}</div>;
    </div>
  );
};

const SignupSSOPageQueryParamsSchema = z.object({
  token: z.string()
});

export const Route = createFileRoute("/_restrict-login-signup/signup/sso/")({
  component: SignupSSOPage,
  validateSearch: zodValidator(SignupSSOPageQueryParamsSchema)
});
