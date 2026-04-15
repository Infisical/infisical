import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";

import { AuthPageBackground } from "@app/components/auth/AuthPageBackground";
import { AuthPageFooter } from "@app/components/auth/AuthPageFooter";
import { AuthPageHeader } from "@app/components/auth/AuthPageHeader";
import { Button } from "@app/components/v3";

import { InitialStep, SSOStep } from "./components";
import { LoginSection } from "./Login.utils";

export const LoginPage = ({ isAdmin }: { isAdmin?: boolean }) => {
  const { t } = useTranslation();
  const [section, setSection] = useState<LoginSection>(LoginSection.Initial);

  const renderView = () => {
    switch (section) {
      case LoginSection.Initial:
        return <InitialStep isAdmin={isAdmin} setSection={setSection} />;
      case LoginSection.SAML:
        return <SSOStep setSection={setSection} type="SAML" />;
      case LoginSection.OIDC:
        return <SSOStep setSection={setSection} type="OIDC" />;
      default:
        return <div />;
    }
  };

  return (
    <div className="relative flex max-h-screen min-h-screen flex-col overflow-y-auto bg-linear-to-tr from-card via-bunker-900 to-card px-4">
      <AuthPageBackground />
      <Helmet>
        <title>{t("common.head-title", { title: t("login.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={t("login.og-title") ?? ""} />
        <meta name="og:description" content={t("login.og-description") ?? ""} />
      </Helmet>
      <AuthPageHeader>
        <Button asChild>
          <Link to="/signup">Sign Up</Link>
        </Button>
      </AuthPageHeader>
      <div className="relative z-10 my-auto flex flex-col items-center py-10">{renderView()}</div>
      <AuthPageFooter />
    </div>
  );
};
