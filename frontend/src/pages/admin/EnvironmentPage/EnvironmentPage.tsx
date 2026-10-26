import { useTranslation } from "react-i18next";

import { PageHeader } from "@app/components/v3";

import { EnvironmentPageForm } from "./components";

export const EnvironmentPage = () => {
  const { t } = useTranslation();

  return (
    <div className="text-foreground">
      <title>{t("common.head-title", { title: "Admin" })}</title>
      <div className="mx-auto flex flex-col justify-between">
        <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
          <PageHeader
            scope="instance"
            title="Environment Variables"
            description="Manage the environment variables for your Infisical instance."
          />
          <EnvironmentPageForm />
        </div>
      </div>
    </div>
  );
};
