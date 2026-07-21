import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";

import { AuthPageLayout } from "@app/components/auth/AuthPageLayout";
import { AuthPagePanel } from "@app/components/auth/AuthPagePanel";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/v3";
import { useSelectOrganization } from "@app/hooks/api";

import { AdminSignUpForm } from "./components/AdminSignUpForm";

export const SignUpPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { mutateAsync: selectOrganization } = useSelectOrganization();

  const handleSuccess = async (result: { token: string; organization: { id: string } }) => {
    SecurityClient.setToken(result.token);
    await selectOrganization({ organizationId: result.organization.id });
    localStorage.setItem("orgData.id", result.organization.id);
    navigate({ to: "/admin" });
  };

  return (
    <AuthPageLayout>
      <Helmet>
        <title>{t("common.head-title", { title: t("signup.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={t("signup.og-title") ?? ""} />
        <meta name="og:description" content={t("signup.og-description") ?? ""} />
      </Helmet>
      <AuthPagePanel>
        <CardHeader className="mb-6 gap-2">
          <CardTitle className="font-alliance text-2xl font-normal">
            Set up your Infisical instance
          </CardTitle>
          <CardDescription className="font-alliance text-base">
            Create a local Super Admin account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminSignUpForm onSuccess={handleSuccess} />
        </CardContent>
      </AuthPagePanel>
    </AuthPageLayout>
  );
};
