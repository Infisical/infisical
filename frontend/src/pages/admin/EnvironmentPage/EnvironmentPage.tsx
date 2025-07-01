import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@app/components/v2";

import { EnvironmentPageForm } from "./components";

export const EnvironmentPage = () => {
  const { t } = useTranslation();

  return (
    <div className="bg-bunker-800">
      <Helmet>
        <title>{t("common.head-title", { title: "Admin" })}</title>
      </Helmet>
      <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
        <div className="mx-auto mb-6 w-full max-w-7xl">
          <PageHeader
            title="Environment Variables"
            description="Manage the environment variables for your Infisical instance."
          />
          <EnvironmentPageForm />
        </div>
      </div>
    </div>
  );
};
