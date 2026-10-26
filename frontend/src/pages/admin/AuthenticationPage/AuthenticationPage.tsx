import { useTranslation } from "react-i18next";

import { PageHeader } from "@app/components/v3";

import { AuthenticationPageForm } from "./components";

export const AuthenticationPage = () => {
  const { t } = useTranslation();

  return (
    <div className="h-full text-foreground">
      <title>{t("common.head-title", { title: "Admin" })}</title>
      <div className="mx-auto flex flex-col justify-between">
        <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
          <PageHeader
            scope="instance"
            title="Authentication"
            description="Manage authentication settings for your Infisical instance."
          />
          <AuthenticationPageForm />
        </div>
      </div>
    </div>
  );
};
