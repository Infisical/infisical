import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import { NoticeBannerV2 } from "@app/components/v2/NoticeBannerV2/NoticeBannerV2";
import { ROUTE_PATHS } from "@app/const/routes";
import { useProject } from "@app/context";
import {
  ProjectPermissionCommitsActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { ProjectType } from "@app/hooks/api/projects/types";

import { CommitHistoryTab } from "./components/CommitHistoryTab";

export const CommitsPage = () => {
  const envSlug = useParams({
    from: ROUTE_PATHS.SecretManager.CommitsPage.id,
    select: (el) => el.environment
  });
  const { currentProject } = useProject();
  const navigate = useNavigate();
  const folderId = useParams({
    from: ROUTE_PATHS.SecretManager.CommitsPage.id,
    select: (el) => el.folderId
  });
  const orgId = useParams({
    from: ROUTE_PATHS.SecretManager.CommitsPage.id,
    select: (el) => el.orgId
  });
  const routerQueryParams: { secretPath?: string } = useSearch({
    from: ROUTE_PATHS.SecretManager.CommitsPage.id
  });

  const secretPath = routerQueryParams?.secretPath || "/";

  const handleSelectCommit = (commitId: string) => {
    navigate({
      to: "/organizations/$orgId/projects/secret-management/$projectId/commits/$environment/$folderId/$commitId",
      params: {
        orgId,
        projectId: currentProject.id,
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
    <div className="mx-auto mb-4 flex h-full w-full max-w-8xl justify-center bg-bunker-800 text-white">
      <div className="w-full">
        <Link
          to="/organizations/$orgId/projects/secret-management/$projectId/secrets/$envSlug"
          params={{
            orgId,
            projectId: currentProject.id,
            envSlug
          }}
          className="mb-4 flex items-center gap-x-2 text-sm text-mineshaft-400"
        >
          <FontAwesomeIcon icon={faChevronLeft} />
          Secrets
        </Link>
        <PageHeader
          scope={ProjectType.SecretManager}
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
            projectId={currentProject.id}
            environment={envSlug}
            secretPath={secretPath}
          />
        </ProjectPermissionCan>
      </div>
    </div>
  );
};
