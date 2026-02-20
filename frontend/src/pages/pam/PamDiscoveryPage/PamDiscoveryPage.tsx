import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@app/components/v2/PageHeader";
import { useProject } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";

import { PamDiscoverySourcesTable } from "./components/PamDiscoverySourcesTable";

export const PamDiscoveryPage = () => {
  const { t } = useTranslation();
  const { currentProject } = useProject();

  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: "PAM Discovery" })}</title>
      </Helmet>
      <div className="h-full bg-bunker-800">
        <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
          <div className="mx-auto mb-6 w-full max-w-8xl">
            <PageHeader
              scope={ProjectType.PAM}
              title="Discovery"
              description="Discover Active Directory resources, accounts, and dependencies automatically."
            />
            <PamDiscoverySourcesTable projectId={currentProject.id} />
          </div>
        </div>
      </div>
    </>
  );
};
