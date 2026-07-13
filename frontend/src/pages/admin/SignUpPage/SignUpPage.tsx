import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";

import { AuthPageBackground } from "@app/components/auth/AuthPageBackground";
import { AuthPageFooter } from "@app/components/auth/AuthPageFooter";
import { AuthPageHeader } from "@app/components/auth/AuthPageHeader";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@app/components/v3";
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
    <div className="relative flex min-h-screen flex-col overflow-y-auto bg-linear-to-tr from-card via-bunker-900 to-card px-4 py-4">
      <AuthPageBackground />
      <Helmet>
        <title>{t("common.head-title", { title: t("signup.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={t("signup.og-title") ?? ""} />
        <meta name="og:description" content={t("signup.og-description") ?? ""} />
      </Helmet>
      <AuthPageHeader />
      <main className="relative z-10 my-auto flex justify-center py-10">
        <Card className="w-full max-w-md gap-0 p-6">
          <CardHeader className="mb-6 gap-2 text-center">
            <CardTitle className="font-alliance justify-center text-2xl font-normal">
              Welcome to Infisical
            </CardTitle>
            <CardDescription className="font-alliance text-base">
              Create your first Super Admin account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AdminSignUpForm onSuccess={handleSuccess} />
          </CardContent>
        </Card>
      </main>
      <AuthPageFooter />
    </div>
  );
};
