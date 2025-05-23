import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@app/components/v2";

import { SecretScanningDataSourcesSection } from "./components";

export const SecretScanningDataSourcesPage = () => {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: "Secret Scanning" })}</title>
      </Helmet>
      <div className="h-full bg-bunker-800">
        <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
          <div className="mx-auto mb-6 w-full max-w-7xl">
            <PageHeader
              title="Data Sources"
              description="Manage your Secret Scanning data sources."
            />
            <SecretScanningDataSourcesSection />
          </div>
        </div>
      </div>
    </>
  );
};
