import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { faBorderAll, faList, faMagnifyingGlass } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { NewNamespaceModal } from "@app/components/namespaces";
import { NewProjectModal } from "@app/components/projects";
import { IconButton, Input, PageHeader } from "@app/components/v2";
import { useSubscription } from "@app/context";
import { usePopUp } from "@app/hooks/usePopUp";

import { AllNamespaceView } from "./components/AllNamespaceView";
import { AllProjectView } from "./components/AllProjectView";
import { MyNamespaceView } from "./components/MyNamespaceView";
import { MyProjectView } from "./components/MyProjectView";
import {
  ResourceListToggle,
  ResourceListView,
  ResourceViewMode
} from "./components/ResourcetListToggle";

// TODO(namespace): work on breadcrumbs
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
    "addNewNamespace",
    "upgradePlan"
  ] as const);

  const { subscription } = useSubscription();
  const shouldRenderNamespaces = subscription?.namespace;

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
          title={shouldRenderNamespaces ? "Overview" : "Projects"}
          description={
            shouldRenderNamespaces
              ? "Your team's complete security toolkit - namespaces and organization level projects"
              : "Your team's complete security toolkit - organized and ready when you need them."
          }
        />
      </div>
      {shouldRenderNamespaces && (
        <>
          <div className="mb-8 flex gap-2">
            <ResourceListToggle
              value={resourceListView}
              onChange={setResourceListView}
              resourceName="resources"
            />
            <Input
              className="h-[2.3rem] bg-mineshaft-800 text-sm placeholder-mineshaft-50 duration-200 focus:bg-mineshaft-700/80"
              containerClassName="w-full "
              placeholder="Search by name..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
            />
            <div className="flex gap-x-0.5 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-1">
              <IconButton
                variant="outline_bg"
                onClick={() => {
                  localStorage.setItem("projectsViewMode", ResourceViewMode.GRID);
                  onResourceViewModeChange(ResourceViewMode.GRID);
                }}
                ariaLabel="grid"
                size="xs"
                className={`${
                  resourceViewMode === ResourceViewMode.GRID ? "bg-mineshaft-500" : "bg-transparent"
                } min-w-[2.4rem] border-none hover:bg-mineshaft-600`}
              >
                <FontAwesomeIcon icon={faBorderAll} />
              </IconButton>
              <IconButton
                variant="outline_bg"
                onClick={() => {
                  localStorage.setItem("projectsViewMode", ResourceViewMode.LIST);
                  onResourceViewModeChange(ResourceViewMode.LIST);
                }}
                ariaLabel="list"
                size="xs"
                className={`${
                  resourceViewMode === ResourceViewMode.LIST ? "bg-mineshaft-500" : "bg-transparent"
                } min-w-[2.4rem] border-none hover:bg-mineshaft-600`}
              >
                <FontAwesomeIcon icon={faList} />
              </IconButton>
            </div>
          </div>
          <div>
            {resourceListView === ResourceListView.MyResource ? (
              <MyNamespaceView
                onAddNewNamespace={() => handlePopUpOpen("addNewNamespace")}
                onUpgradePlan={() => handlePopUpOpen("upgradePlan")}
                isAddingNamespacesAllowed={subscription.namespace}
                searchFilter={searchFilter}
                resourceViewMode={resourceViewMode}
              />
            ) : (
              <AllNamespaceView
                onAddNewNamespace={() => handlePopUpOpen("addNewNamespace")}
                onUpgradePlan={() => handlePopUpOpen("upgradePlan")}
                isAddingNamespacesAllowed={subscription.namespace}
                searchFilter={searchFilter}
              />
            )}
          </div>
        </>
      )}
      {resourceListView === ResourceListView.MyResource ? (
        <MyProjectView
          onAddNewProject={() => handlePopUpOpen("addNewWs")}
          onUpgradePlan={() => handlePopUpOpen("upgradePlan")}
          isAddingProjectsAllowed={isAddingProjectsAllowed}
          resourceListView={resourceListView}
          onResourceListViewChange={handleSetResourceListView}
          searchFilter={searchFilter}
          onSearchChange={setSearchFilter}
          hasNamespace={shouldRenderNamespaces}
          resourceViewMode={resourceViewMode}
          onResourceViewModeChange={onResourceViewModeChange}
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
          hasNamespace={shouldRenderNamespaces}
        />
      )}
      <NewProjectModal
        isOpen={popUp.addNewWs.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addNewWs", isOpen)}
      />
      <NewNamespaceModal
        isOpen={popUp.addNewNamespace.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addNewNamespace", isOpen)}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="You have exceeded the number of projects allowed on the free plan."
      />
    </div>
  );
};
