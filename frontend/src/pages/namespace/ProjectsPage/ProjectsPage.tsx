import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { NewProjectModal } from "@app/components/projects";
import { PageHeader } from "@app/components/v2";
import { useSubscription } from "@app/context";
import { usePopUp } from "@app/hooks/usePopUp";
import { AllProjectView } from "@app/pages/organization/ProjectsPage/components/AllProjectView";
import { MyProjectView } from "@app/pages/organization/ProjectsPage/components/MyProjectView";
import {
  ResourceListView,
  ResourceViewMode
} from "@app/pages/organization/ProjectsPage/components/ResourcetListToggle";

export const ProjectsPage = () => {
  const { t } = useTranslation();

  const [searchFilter, setSearchFilter] = useState("");

  const [resourceListView, setResourceListView] = useState<ResourceListView>(() => {
    const storedView = localStorage.getItem("resourceListView");

    if (
      storedView &&
      (storedView === ResourceListView.AllResources || storedView === ResourceListView.MyResource)
    ) {
      return storedView;
    }

    return ResourceListView.MyResource;
  });

  const [resourceViewMode, onResourceViewModeChange] = useState<ResourceViewMode>(
    (localStorage.getItem("resourceViewMode") as ResourceViewMode) || ResourceViewMode.GRID
  );

  const handleSetResourceListView = (value: ResourceListView) => {
    localStorage.setItem("resourceListView", value);
    setResourceListView(value);
  };

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "addNewWs",
    "upgradePlan"
  ] as const);

  const { subscription } = useSubscription();

  const isAddingProjectsAllowed = subscription?.workspaceLimit
    ? subscription.workspacesUsed < subscription.workspaceLimit
    : true;

  return (
    <div className="mx-auto flex max-w-7xl flex-col justify-start bg-bunker-800">
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.members.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <div className="mb-4 flex flex-col items-start justify-start">
        <PageHeader
          title="Projects"
          description="Your team's complete security toolkit - organized and ready when you need them."
        />
      </div>
      {resourceListView === ResourceListView.MyResource ? (
        <MyProjectView
          onAddNewProject={() => handlePopUpOpen("addNewWs")}
          onUpgradePlan={() => handlePopUpOpen("upgradePlan")}
          isAddingProjectsAllowed={isAddingProjectsAllowed}
          searchFilter={searchFilter}
          onSearchChange={setSearchFilter}
          resourceViewMode={resourceViewMode}
          onResourceViewModeChange={onResourceViewModeChange}
          resourceListView={resourceListView}
          onResourceListViewChange={handleSetResourceListView}
        />
      ) : (
        <AllProjectView
          onAddNewProject={() => handlePopUpOpen("addNewWs")}
          onUpgradePlan={() => handlePopUpOpen("upgradePlan")}
          isAddingProjectsAllowed={isAddingProjectsAllowed}
          resourceListView={resourceListView}
          onResourceListViewChange={handleSetResourceListView}
          searchFilter={searchFilter}
          onSearchChange={setSearchFilter}
        />
      )}
      <NewProjectModal
        isOpen={popUp.addNewWs.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addNewWs", isOpen)}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="You have exceeded the number of projects allowed on the free plan."
      />
    </div>
  );
};
