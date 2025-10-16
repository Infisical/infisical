import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@app/components/v2";

import { IntegrationsPageForm } from "./components";

export const IntegrationsPage = () => {
  const { t } = useTranslation();

  return (
    <div className="h-full bg-bunker-800">
      <Helmet>
        <title>{t("common.head-title", { title: "Admin" })}</title>
      </Helmet>
      <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
        <div className="mx-auto mb-6 w-full max-w-7xl">
          <PageHeader
            scope="instance"
            title="Integrations"
            description="Manage integrations for your Infisical instance."
          />
          <IntegrationsPageForm />
        </div>
      </div>
    </div>
  );
};
