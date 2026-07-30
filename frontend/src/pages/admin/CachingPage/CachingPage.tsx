import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@app/components/v2";

import { CachingPageForm } from "./components";

export const CachingPage = () => {
  const { t } = useTranslation();

  return (
    <div className="h-full bg-background text-foreground">
      <Helmet>
        <title>{t("common.head-title", { title: "Admin" })}</title>
      </Helmet>
      <div className="mx-auto flex flex-col justify-between">
        <div className="mx-auto mb-6 w-full max-w-8xl">
          <PageHeader
            scope="instance"
            title="Caching"
            description="Manage caching for your Infisical instance."
          />
          <CachingPageForm />
        </div>
      </div>
    </div>
  );
};
