import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useParams } from "@tanstack/react-router";

import { PageHeader } from "@app/components/v2";
import { ProjectType } from "@app/hooks/api/projects/types";

import { SqlConsoleSection } from "./components/SqlConsoleSection";

export const SqlConsolePage = () => {
  const { t } = useTranslation();
  const { sessionId } = useParams({
    from: "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/pam/$projectId/_pam-layout/sql-console/$sessionId"
  });

  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: "SQL Console" })}</title>
      </Helmet>
      <div className="h-full bg-bunker-800">
        <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
          <div className="mx-auto mb-6 w-full max-w-8xl">
            <PageHeader
              scope={ProjectType.PAM}
              title="SQL Console"
              description="Execute SQL queries against your PostgreSQL database."
            />
            <SqlConsoleSection sessionId={sessionId} />
          </div>
        </div>
      </div>
    </>
  );
};

