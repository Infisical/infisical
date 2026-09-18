import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";

import { AuthPageLayout } from "@app/components/auth/AuthPageLayout";
import { useServerConfig } from "@app/context";
import { LoginMethod } from "@app/hooks/api/admin/types";

import { InitialStep } from "./components";

export const LoginPage = ({ isAdmin }: { isAdmin?: boolean }) => {
  const { t } = useTranslation();
  const { config } = useServerConfig();

  const shouldDisplayLoginMethod = (method: LoginMethod) =>
    isAdmin || !config.enabledLoginMethods || config.enabledLoginMethods.includes(method);

  return (
    <AuthPageLayout
      showFooter={false}
      bottomContent={
        shouldDisplayLoginMethod(LoginMethod.EMAIL) ? (
          <div className="text-xs text-label">
            Help me{" "}
            <Link
              to="/account-recovery"
              className="underline underline-offset-2 transition-colors duration-200 hover:text-foreground hover:decoration-project/45"
            >
              recover my account
            </Link>
          </div>
        ) : undefined
      }
    >
      <Helmet>
        <title>{t("common.head-title", { title: t("login.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={t("login.og-title") ?? ""} />
        <meta name="og:description" content={t("login.og-description") ?? ""} />
      </Helmet>
      <InitialStep isAdmin={isAdmin} />
    </AuthPageLayout>
  );
};
