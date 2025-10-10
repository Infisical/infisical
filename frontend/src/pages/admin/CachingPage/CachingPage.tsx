import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@app/components/v2";

import { CachingPageForm } from "./components";

export const CachingPage = () => {
  const { t } = useTranslation();

  return (
    <div className="bg-bunker-800 h-full">
      <Helmet>
        <title>{t("common.head-title", { title: "Admin" })}</title>
      </Helmet>
      <div className="bg-bunker-800 container mx-auto flex flex-col justify-between text-white">
        <div className="mx-auto mb-6 w-full max-w-7xl">
          <PageHeader title="Caching" description="Manage caching for your Infisical instance." />
          <CachingPageForm />
        </div>
      </div>
    </div>
  );
};
