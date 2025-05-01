import { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useSearch } from "@tanstack/react-router";
import { jwtDecode } from "jwt-decode";

import { ROUTE_PATHS } from "@app/const/routes";

import { EmailConfirmationStep } from "./components/EmailConfirmationStep";
import { UserInfoSSOStep } from "./components/UserInfoSSOStep";

export const SignupSsoPage = () => {
  const { t } = useTranslation();
  const search = useSearch({ from: ROUTE_PATHS.Auth.SignUpSsoPage.id });
  const token = search.token as string;
  const defaultOrgAllowed = search.defaultOrgAllowed as boolean | undefined;

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
            providerAuthToken={token}
            forceDefaultOrg={defaultOrgAllowed}
          />
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
        <img
          src="/images/gradientLogo.svg"
          style={{
            height: "90px",
            width: "120px"
          }}
          alt="Infisical Logo"
        />
      </div>
      <div>{renderView()}</div>
    </div>
  );
};
