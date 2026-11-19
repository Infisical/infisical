import { useSearch } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import { ProjectPermissionCan } from "@app/components/permissions";
import { LookingForOrgPageLink, PageLoader } from "@app/components/v3";
import { PageHeader } from "@app/components/v3/platform";
import { ProjectPermissionSub, useOrganization } from "@app/context";
import { ProjectPermissionSecretScanningConfigActions } from "@app/context/ProjectPermissionContext/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { useGetSecretScanningInstanceState } from "@app/hooks/api/secretScanningV2";
import { ProjectGeneralTab } from "@app/pages/project/SettingsPage/components/ProjectGeneralTab";

import { ProjectScanningConfigTab } from "./components/ProjectScanningConfigTab";

export const SettingsPage = () => {
  const { selectedTab } = useSearch({
    from: "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/secret-scanning/_secret-scanning-layout/settings"
  });

  const { currentOrg } = useOrganization();
  const { data: instanceState, isPending: isInstanceStatePending } =
    useGetSecretScanningInstanceState(currentOrg.id);
  const hasMultipleProjects = Boolean(instanceState?.isMultiInstance);

  // General only exists while there are several projects to rename or delete. Until the project count
  // arrives the tab for "general" is unknown, so a loader shows instead of a tab that could be swapped out
  // from under an edit.
  const isGeneralRequested = !selectedTab || selectedTab === "general";
  const isTabPending = isGeneralRequested && isInstanceStatePending;
  const activeTab =
    !hasMultipleProjects && isGeneralRequested ? "scanning-settings" : selectedTab || "general";

  return (
    <div className="flex h-full w-full justify-center bg-page text-foreground-inverse">
      <PageTitle title="Secret Scanning Settings" />
      <div className="w-full max-w-8xl">
        <PageHeader
          scope={ProjectType.SecretScanning}
          title="Settings"
          description="Configure your Secret Scanning product's configurations."
        >
          <LookingForOrgPageLink page="settings" />
        </PageHeader>
        <div>
          {isTabPending && (
            <div className="h-32">
              <PageLoader lottieClassName="w-16" />
            </div>
          )}
          {!isTabPending && activeTab === "general" && <ProjectGeneralTab />}
          {!isTabPending && activeTab === "scanning-settings" && (
            <ProjectPermissionCan
              I={ProjectPermissionSecretScanningConfigActions.Read}
              a={ProjectPermissionSub.SecretScanningConfigs}
              renderGuardBanner
            >
              <ProjectScanningConfigTab />
            </ProjectPermissionCan>
          )}
        </div>
      </div>
    </div>
  );
};
