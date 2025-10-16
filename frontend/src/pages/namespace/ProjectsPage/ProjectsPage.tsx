import { useState } from "react";
import { Helmet } from "react-helmet";
import { faCube, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { NamespacePermissionCan } from "@app/components/permissions";
import { NewProjectModal } from "@app/components/projects";
import { Button, PageHeader } from "@app/components/v2";
import {
  NamespacePermissionActions,
  NamespacePermissionSubjects,
  useNamespace,
  useSubscription
} from "@app/context";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { ProjectType } from "@app/hooks/api/projects/types";
import { usePopUp } from "@app/hooks/usePopUp";
import { AllProjectView } from "@app/pages/organization/ProjectsPage/components/AllProjectView";
import { MyProjectView } from "@app/pages/organization/ProjectsPage/components/MyProjectView";
import {
  ResourceListScopeFilter,
  ResourceListToolbar,
  ResourceViewMode
} from "@app/pages/organization/ProjectsPage/components/ResourceListToolbar";

export const ProjectsPage = () => {
  const { namespaceId } = useNamespace();

  const [searchFilter, setSearchFilter] = useState("");
  const [orderDirection, setOrderDirection] = useState(OrderByDirection.ASC);
  const [resourceListScope, setResourceListScope] = useState<ResourceListScopeFilter>(() => {
    const storedView = localStorage.getItem("projectListView");

    if (
      storedView &&
      (storedView === ResourceListScopeFilter.Global ||
        storedView === ResourceListScopeFilter.Personal)
    ) {
      return storedView;
    }

    return ResourceListScopeFilter.Personal;
  });
  const [projectTypeFilter, setProjectTypeFilter] = useState<Partial<Record<ProjectType, boolean>>>(
    {}
  );

  const handleSetProjectListView = (value: ResourceListScopeFilter) => {
    localStorage.setItem("projectListView", value);
    setResourceListScope(value);
  };

  const [resourceViewMode, setResourceViewMode] = useState<ResourceViewMode>(
    (localStorage.getItem("projectsViewMode") as ResourceViewMode) || ResourceViewMode.GRID
  );

  const handleSetResourceViewMode = (value: ResourceViewMode) => {
    localStorage.setItem("projectsViewMode", value);
    setResourceViewMode(value);
  };

  const handleToggleFilterByProjectType = (type: ProjectType) => {
    setProjectTypeFilter((state) => {
      return {
        ...(state || {}),
        [type]: !state?.[type]
      };
    });
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
        <title>Namespace Overview</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <div className="mb-4 flex flex-col items-start justify-start">
        <PageHeader
          scope="namespace"
          title="Overview"
          description="Your team's complete security toolkit - organized and ready when you need them."
        />
      </div>
      <div>
        <ResourceListToolbar
          resourceListScope={resourceListScope}
          onResourceListScopeChange={handleSetProjectListView}
          resourceViewMode={resourceViewMode}
          onResourceViewModeChange={handleSetResourceViewMode}
          orderDirection={orderDirection}
          onOrderDirectionChange={setOrderDirection}
          onSearchChange={setSearchFilter}
          searchValue={searchFilter}
          projectTypeFilter={projectTypeFilter}
          setProjectTypeFilter={handleToggleFilterByProjectType}
        >
          <NamespacePermissionCan
            I={NamespacePermissionActions.Create}
            a={NamespacePermissionSubjects.Project}
          >
            {(isAllowed) => (
              <Button
                colorSchema="secondary"
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                isDisabled={!isAllowed}
                onClick={() => {
                  if (isAddingProjectsAllowed) {
                    handlePopUpOpen("addNewWs");
                  } else {
                    handlePopUpOpen("upgradePlan");
                  }
                }}
              >
                New Project
              </Button>
            )}
          </NamespacePermissionCan>
        </ResourceListToolbar>
      </div>
      <div className="mt-8">
        <div className="mb-4 flex items-center text-xl text-white">
          <FontAwesomeIcon icon={faCube} className="mr-2" />
          Namespace Projects
        </div>
        {resourceListScope === ResourceListScopeFilter.Personal ? (
          <MyProjectView
            resourceViewMode={resourceViewMode}
            searchValue={searchFilter}
            projectTypeFilter={projectTypeFilter}
            orderDirection={orderDirection}
            namespaceId={namespaceId}
          />
        ) : (
          <AllProjectView
            searchValue={searchFilter}
            orderDirection={orderDirection}
            namespaceId={namespaceId}
          />
        )}
      </div>
      <NewProjectModal
        isOpen={popUp.addNewWs.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addNewWs", isOpen)}
        namespaceId={namespaceId}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="You have exceeded the number of projects allowed on the free plan."
      />
    </div>
  );
};
