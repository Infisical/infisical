import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@app/components/v2";
import { useGetServerConfig } from "@app/hooks/api/admin";

import { GeneralPageForm, UsageReportSection } from "./components";

export const GeneralPage = () => {
  const { t } = useTranslation();
  const { data: serverConfig } = useGetServerConfig();

  return (
    <div className="bg-bunker-800 h-full">
      <Helmet>
        <title>{t("common.head-title", { title: "Admin" })}</title>
      </Helmet>
      <div className="bg-bunker-800 container mx-auto flex flex-col justify-between text-white">
        <div className="mx-auto mb-6 w-full max-w-7xl">
          <PageHeader
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
