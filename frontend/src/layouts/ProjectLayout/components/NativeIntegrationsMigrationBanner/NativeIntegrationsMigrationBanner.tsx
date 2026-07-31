import { faWarning, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";

import { IconButton } from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject, useProjectPermission } from "@app/context";
import { useBannerDismissal } from "@app/hooks";
import { useGetWorkspaceIntegrations } from "@app/hooks/api";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";
import { IntegrationsListPageTabs } from "@app/types/integrations";

export const NativeIntegrationsMigrationBanner = () => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { hasProjectRole } = useProjectPermission();
  const isProjectAdmin = hasProjectRole(ProjectMembershipRole.Admin);

  // dismissal is per project — closing it here shouldn't hide it in a different project
  const [isDismissed, dismiss] = useBannerDismissal(
    `native-integrations-migration-banner-dismissed-at:${currentProject.id}`
  );

  const { data: integrations = [] } = useGetWorkspaceIntegrations(currentProject.id, {
    enabled: isProjectAdmin && !isDismissed,
    refetchInterval: false
  });

  if (isDismissed || !isProjectAdmin || integrations.length === 0) return null;

  return (
    <div className="flex w-full items-center border-b border-yellow/50 bg-yellow/30 px-4 py-2 text-sm text-yellow-200">
      <FontAwesomeIcon icon={faWarning} className="mr-2.5 text-base text-yellow" />
      This project has {integrations.length} native integration
      {integrations.length > 1 ? "s" : ""}. Native integrations are deprecated, recreate them as
      Secret Syncs.
      <Link
        to={ROUTE_PATHS.SecretManager.IntegrationsListPage.path}
        params={{ orgId: currentOrg.id, projectId: currentProject.id }}
        search={{ selectedTab: IntegrationsListPageTabs.SecretSyncs }}
        className="cursor-pointer pl-1 underline underline-offset-2 duration-100 hover:text-mineshaft-100 hover:decoration-mineshaft-100"
      >
        Go to Secret Syncs
      </Link>
      <IconButton
        className="ml-auto shrink-0 p-0 text-yellow-200"
        ariaLabel="Dismiss banner"
        variant="plain"
        onClick={dismiss}
      >
        <FontAwesomeIcon icon={faXmark} />
      </IconButton>
    </div>
  );
};
