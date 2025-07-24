import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import { NoticeBannerV2 } from "@app/components/v2/NoticeBannerV2/NoticeBannerV2";
import { ROUTE_PATHS } from "@app/const/routes";
import { useWorkspace } from "@app/context";
import {
  ProjectPermissionCommitsActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";

import { CommitHistoryTab } from "./components/CommitHistoryTab";

export const CommitsPage = () => {
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
      to: "/projects/secret-management/$projectId/commits/$environment/$folderId/$commitId",
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
      <div className="w-full max-w-[75vw]">
        <PageHeader
          title="Commits"
          description="Track, inspect, and restore your secrets and folders with confidence. View the complete history of changes made to your environment, examine specific modifications at each commit point, and preview the exact impact before rolling back to previous states."
        />
        <NoticeBannerV2 title="Secret Snapshots Update" className="mb-2">
          <p className="my-1 text-sm text-mineshaft-300">
            Secret Snapshots have been officially renamed to Commits. Going forward, all secret
            changes will be tracked as Commits. If you made changes before this update, you can
            still access your older Secret Snapshots by temporarily re-enabling the legacy feature
            in your project settings.
          </p>
        </NoticeBannerV2>
        <ProjectPermissionCan
          renderGuardBanner
          I={ProjectPermissionCommitsActions.Read}
          a={ProjectPermissionSub.Commits}
        >
          <CommitHistoryTab
            onSelectCommit={handleSelectCommit}
            projectId={currentWorkspace.id}
            environment={envSlug}
            secretPath={secretPath}
          />
        </ProjectPermissionCan>
      </div>
    </div>
  );
};
