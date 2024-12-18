import { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { jwtDecode } from "jwt-decode";
import { z } from "zod";

import { PasswordStep } from "../-components";

const LoginSSOPage = () => {
  const { t } = useTranslation();
  const search = useSearch({ from: "/_restrict-login-signup/login/sso/" });
  const token = search.token as string;
  const [step, setStep] = useState(0);
  const [password, setPassword] = useState("");

  const { username, isUserCompleted } = jwtDecode(token) as any;

  useEffect(() => {
    if (isUserCompleted) {
      setStep(1);
    }
  }, []);

  const renderView = () => {
    switch (step) {
      case 0:
        return <div />;
      case 1:
        return (
          <PasswordStep
            providerAuthToken={token}
            email={username}
            password={password}
            setPassword={setPassword}
          />
        );
      default:
        return <div />;
    }
  };

  return (
    <div className="flex h-screen flex-col justify-center bg-gradient-to-tr from-mineshaft-600 via-mineshaft-800 to-bunker-700 px-6 pb-28">
      <Helmet>
        <title>{t("common.head-title", { title: t("login.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={t("login.og-title") ?? ""} />
        <meta name="og:description" content={t("login.og-description") ?? ""} />
      </Helmet>
      <Link href="/">
        <div className="mb-4 mt-20 flex justify-center">
          <img src="/images/gradientLogo.svg" height={90} width={120} alt="Infisical logo" />
        </div>
      </Link>
      <div>{renderView()}</div>;
    </div>
  );
};

const LoginSSOQueryParamsSchema = z.object({
  token: z.string()
});

export const Route = createFileRoute("/_restrict-login-signup/login/sso/")({
  component: LoginSSOPage,
  validateSearch: zodValidator(LoginSSOQueryParamsSchema)
});
