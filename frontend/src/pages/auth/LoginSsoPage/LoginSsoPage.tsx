import { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useSearch } from "@tanstack/react-router";
import { jwtDecode } from "jwt-decode";

import { ROUTE_PATHS } from "@app/const/routes";

import { PasswordStep } from "../LoginPage/components";

export const LoginSsoPage = () => {
  const { t } = useTranslation();
  const search = useSearch({ from: ROUTE_PATHS.Auth.LoginSSO.id });
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
            isAdminLogin={search.isAdminLogin}
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
      <Link to="/">
        <div className="mb-4 mt-20 flex justify-center">
          <img
            src="/images/gradientLogo.svg"
            style={{ height: "90px", width: "120px" }}
            alt="Infisical logo"
          />
        </div>
      </Link>
      <div>{renderView()}</div>
    </div>
  );
};
