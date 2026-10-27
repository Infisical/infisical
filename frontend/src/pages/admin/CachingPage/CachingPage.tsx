import { useTranslation } from "react-i18next";

import { PageTitle } from "@app/components/PageTitle";
import { PageHeader } from "@app/components/v3";

import { CachingPageForm } from "./components";

export const CachingPage = () => {
  const { t } = useTranslation();

  return (
    <div className="h-full text-foreground">
      <PageTitle title={t("page-titles.caching")} />
      <div className="mx-auto flex flex-col justify-between">
        <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
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
