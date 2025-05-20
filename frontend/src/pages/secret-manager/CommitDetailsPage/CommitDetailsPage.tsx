import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { ROUTE_PATHS } from "@app/const/routes";
import { useWorkspace } from "@app/context";
import { ProjectType } from "@app/hooks/api/workspace/types";

import { CommitDetailsTab } from "./components/CommitDetailsTab";

export const CommitDetailsPage = () => {
  const { t } = useTranslation();
  const envSlug = useParams({
    from: ROUTE_PATHS.SecretManager.CommitDetailsPage.id,
    select: (el) => el.environment
  });
  const selectedCommitId = useParams({
    from: ROUTE_PATHS.SecretManager.CommitDetailsPage.id,
    select: (el) => el.commitId
  });
  const folderId = useParams({
    from: ROUTE_PATHS.SecretManager.CommitDetailsPage.id,
    select: (el) => el.folderId
  });
  const { currentWorkspace } = useWorkspace();

  const navigate = useNavigate();
  const routerQueryParams: { secretPath?: string } = useSearch({
    from: ROUTE_PATHS.SecretManager.CommitDetailsPage.id
  });

  const secretPath = (routerQueryParams.secretPath as string) || "/";

  const handleGoBackToHistory = () => {
    navigate({
      to: `/${ProjectType.SecretManager}/$projectId/commits/$environment/$folderId` as const,
      params: {
        projectId: currentWorkspace.id,
        folderId,
        environment: envSlug
      },
      search: (query) => ({
        ...query,
        secretPath
      })
    });
  };

  const handleGoToRollbackPreview = () => {
    navigate({
      to: `/${ProjectType.SecretManager}/$projectId/commits/$environment/$folderId/$commitId/restore` as const,
      params: {
        projectId: currentWorkspace.id,
        folderId,
        environment: envSlug,
        commitId: selectedCommitId
      },
      search: (query) => ({
        ...query,
        secretPath
      })
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl justify-center bg-bunker-800 pb-4 pt-2 text-white">
      <Helmet>
        <title>{t("common.head-title", { title: "Commit History" })}</title>
      </Helmet>
      <div className="w-full max-w-[75vw]">
        <CommitDetailsTab
          selectedCommitId={selectedCommitId}
          workspaceId={currentWorkspace.id}
          goBackToHistory={handleGoBackToHistory}
          envSlug={envSlug}
          goToRollbackPreview={handleGoToRollbackPreview}
        />
      </div>
    </div>
  );
};
