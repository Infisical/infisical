import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@app/components/v2";
import { ProjectType } from "@app/hooks/api/projects/types";

import { PamDomainsSection } from "./components/PamDomainsSection";

export const PamDomainsPage = () => {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: "PAM Domains" })}</title>
      </Helmet>
      <div className="h-full bg-bunker-800">
        <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
          <div className="mx-auto mb-6 w-full max-w-8xl">
            <PageHeader
              scope={ProjectType.PAM}
              title="Domains"
              description="Manage domains and directory services."
            />
            <PamDomainsSection />
          </div>
        </div>
      </div>
    </>
  );
};
