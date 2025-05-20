import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { PageHeader } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { useWorkspace } from "@app/context";
import { ProjectType } from "@app/hooks/api/workspace/types";

import { CommitHistoryTab } from "./components/CommitHistoryTab";

export const CommitsPage = () => {
  const { t } = useTranslation();
  const envSlug = useParams({
    from: ROUTE_PATHS.SecretManager.CommitsPage.id,
    select: (el) => el.environment
  });
  const { currentWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const folderId = useParams({
    from: ROUTE_PATHS.SecretManager.CommitsPage.id,
    select: (el) => el.folderId
  });
  const routerQueryParams: { secretPath?: string } = useSearch({
    from: ROUTE_PATHS.SecretManager.CommitsPage.id
  });

  const secretPath = routerQueryParams?.secretPath || "/";

  const handleSelectCommit = (commitId: string) => {
    navigate({
      to: `/${ProjectType.SecretManager}/$projectId/commits/$environment/$folderId/$commitId` as const,
      params: {
        projectId: currentWorkspace.id,
        folderId,
        environment: envSlug,
        commitId
      },
      search: (query) => ({
        ...query,
        secretPath
      })
    });
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-7xl justify-center bg-bunker-800 py-4 text-white">
      <Helmet>
        <title>{t("common.head-title", { title: "Commit History" })}</title>
      </Helmet>
      <div className="w-full max-w-[75vw]">
        <PageHeader
          title="Commits"
          description="Track, inspect, and restore your secrets and folders with confidence. View the complete history of changes made to your environment, examine specific modifications at each commit point, and preview the exact impact before rolling back to previous states."
        />
        <CommitHistoryTab
          onSelectCommit={handleSelectCommit}
          projectId={currentWorkspace.id}
          environment={envSlug}
          secretPath={secretPath}
        />
      </div>
    </div>
  );
};
