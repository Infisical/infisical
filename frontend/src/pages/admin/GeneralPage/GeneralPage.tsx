import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@app/components/v3";
import { useGetServerConfig } from "@app/hooks/api/admin";

import { GeneralPageForm, UsageReportSection } from "./components";

export const GeneralPage = () => {
  const { t } = useTranslation();
  const { data: serverConfig } = useGetServerConfig();

  return (
    <div className="h-full text-foreground">
      <Helmet>
        <title>{t("common.head-title", { title: "Admin" })}</title>
      </Helmet>
      <div className="mx-auto flex flex-col justify-between">
        <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col gap-8">
          <PageHeader
            scope="instance"
            title="General"
            description="Manage general settings for your Infisical instance."
          />
          <div className="space-y-6">
            <GeneralPageForm />
            {serverConfig?.isOfflineUsageReportsEnabled && <UsageReportSection />}
          </div>
        </div>
      </div>
    </div>
  );
};
