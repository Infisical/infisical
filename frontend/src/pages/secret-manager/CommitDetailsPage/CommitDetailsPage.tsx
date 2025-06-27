import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { ProjectPermissionCan } from "@app/components/permissions";
import { ROUTE_PATHS } from "@app/const/routes";
import { useWorkspace } from "@app/context";
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
  const { currentWorkspace } = useWorkspace();

  const navigate = useNavigate();
  const routerQueryParams: { secretPath?: string } = useSearch({
    from: ROUTE_PATHS.SecretManager.CommitDetailsPage.id
  });

  const secretPath = (routerQueryParams.secretPath as string) || "/";

  const handleGoBackToHistory = () => {
    navigate({
      to: "/projects/$projectId/secret-manager/commits/$environment/$folderId",
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
      to: "/projects/$projectId/secret-manager/commits/$environment/$folderId/$commitId/restore",
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
      <div className="w-full max-w-[75vw]">
        <ProjectPermissionCan
          renderGuardBanner
          I={ProjectPermissionCommitsActions.Read}
          a={ProjectPermissionSub.Commits}
        >
          <CommitDetailsTab
            selectedCommitId={selectedCommitId}
            workspaceId={currentWorkspace.id}
            goBackToHistory={handleGoBackToHistory}
            envSlug={envSlug}
            goToRollbackPreview={handleGoToRollbackPreview}
          />
        </ProjectPermissionCan>
      </div>
    </div>
  );
};
