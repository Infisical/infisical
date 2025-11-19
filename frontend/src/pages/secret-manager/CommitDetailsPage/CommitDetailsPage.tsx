import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { ProjectPermissionCan } from "@app/components/permissions";
import { ROUTE_PATHS } from "@app/const/routes";
import { useProject } from "@app/context";
import {
  ProjectPermissionCommitsActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";

import { CommitDetailsTab } from "./components/CommitDetailsTab";

export const CommitDetailsPage = () => {
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
  const orgId = useParams({
    from: ROUTE_PATHS.SecretManager.CommitDetailsPage.id,
    select: (el) => el.orgId
  });
  const { currentProject } = useProject();

  const navigate = useNavigate();
  const routerQueryParams: { secretPath?: string } = useSearch({
    from: ROUTE_PATHS.SecretManager.CommitDetailsPage.id
  });

  const secretPath = (routerQueryParams.secretPath as string) || "/";

  const handleGoBackToHistory = () => {
    navigate({
      to: "/organizations/$orgId/projects/secret-management/$projectId/commits/$environment/$folderId",
      params: {
        orgId,
        projectId: currentProject.id,
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
      to: "/organizations/$orgId/projects/secret-management/$projectId/commits/$environment/$folderId/$commitId/restore",
      params: {
        orgId,
        projectId: currentProject.id,
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
    <div className="mx-auto flex w-full max-w-8xl justify-center bg-bunker-800 pt-2 pb-4 text-white">
      <div className="w-full max-w-[75vw]">
        <ProjectPermissionCan
          renderGuardBanner
          I={ProjectPermissionCommitsActions.Read}
          a={ProjectPermissionSub.Commits}
        >
          <CommitDetailsTab
            selectedCommitId={selectedCommitId}
            projectId={currentProject.id}
            goBackToHistory={handleGoBackToHistory}
            envSlug={envSlug}
            goToRollbackPreview={handleGoToRollbackPreview}
          />
        </ProjectPermissionCan>
      </div>
    </div>
  );
};
