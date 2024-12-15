import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { createFileRoute, Link } from "@tanstack/react-router";

import { InitialStep, SSOStep } from "./-components";

const LoginPage = () => {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // TODO(rbr): move this to beforeload
  // const { navigateToSelectOrganization } = useNavigateToSelectOrganization();
  //
  // const queryParams = new URLSearchParams(window.location.search);
  //
  // useEffect(() => {
  //   // TODO(akhilmhdh): workspace will be controlled by a workspace context
  //   const handleRedirects = async () => {
  //     try {
  //       const callbackPort = queryParams?.get("callback_port");
  //       // case: a callback port is set, meaning it's a cli login request: redirect to select org with callback port
  //       if (callbackPort) {
  //         navigateToSelectOrganization(callbackPort);
  //       } else {
  //         // case: no callback port, meaning it's a regular login request: redirect to select org
  //         navigateToSelectOrganization();
  //       }
  //     } catch (error) {
  //       console.log("Error - Not logged in yet");
  //     }
  //   };
  //   if (isLoggedIn()) {
  //     handleRedirects();
  //   }
  // }, []);

  const renderView = () => {
    switch (step) {
      case 0:
        return (
          <InitialStep
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
    <div className="flex max-h-screen min-h-screen flex-col justify-center overflow-y-auto bg-gradient-to-tr from-mineshaft-600 via-mineshaft-800 to-bunker-700 px-6">
      <Helmet>
        <title>{t("common.head-title", { title: t("login.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={t("login.og-title") ?? ""} />
        <meta name="og:description" content={t("login.og-description") ?? ""} />
      </Helmet>
      <Link to="/">
        <div className="mb-4 mt-20 flex justify-center">
          <img src="/images/gradientLogo.svg" height={90} width={120} alt="Infisical logo" />
        </div>
      </Link>
      <div className="pb-28">{renderView()}</div>;
    </div>
  );
};

export const Route = createFileRoute("/_restrict_login_signup/login/")({
  component: LoginPage
});
