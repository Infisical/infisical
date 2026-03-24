import { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";

import { AuthPageBackground } from "@app/components/auth/AuthPageBackground";
import { AuthPageFooter } from "@app/components/auth/AuthPageFooter";
import { AuthPageHeader } from "@app/components/auth/AuthPageHeader";
import { Button } from "@app/components/v3";
import { isLoggedIn } from "@app/hooks/api/reactQuery";

import { InitialStep, SSOStep } from "./components";
import { useNavigateToSelectOrganization } from "./Login.utils";

export const LoginPage = ({ isAdmin }: { isAdmin?: boolean }) => {
  const { t } = useTranslation();
  const [step, setStep] = useState<number | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { navigateToSelectOrganization } = useNavigateToSelectOrganization();

  const queryParams = new URLSearchParams(window.location.search);

  useEffect(() => {
    // TODO(akhilmhdh): workspace will be controlled by a workspace context
    const handleRedirects = async () => {
      try {
        const callbackPort = queryParams?.get("callback_port");
        // case: a callback port is set, meaning it's a cli login request: redirect to select org with callback port
        if (callbackPort) {
          navigateToSelectOrganization(callbackPort);
        } else {
          // case: no callback port, meaning it's a regular login request: redirect to select org
          navigateToSelectOrganization();
        }
      } catch {
        console.log("Error - Not logged in yet");
      }
    };

    if (isLoggedIn()) {
      handleRedirects();
    } else {
      setStep(0);
    }
  }, []);

  const renderView = () => {
    switch (step) {
      case 0:
        return (
          <InitialStep
            isAdmin={isAdmin}
            setStep={setStep}
            email={email}
            setEmail={setEmail}
            password={password}
            setPassword={setPassword}
          />
        );
      case 2:
        return <SSOStep setStep={setStep} type="SAML" />;
      case 3:
        return <SSOStep setStep={setStep} type="OIDC" />;
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
