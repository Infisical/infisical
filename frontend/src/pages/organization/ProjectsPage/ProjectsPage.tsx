// REFACTOR(akhilmhdh): This file needs to be split into multiple components too complex
import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { NewProjectModal } from "@app/components/projects";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  PageHeader
} from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useSubscription } from "@app/context";
import { usePopUp } from "@app/hooks/usePopUp";

import { AllProjectView } from "./components/AllProjectView";
import { MyProjectView } from "./components/MyProjectView";
import { ResourceListScopeFilter, ResourceViewMode, Toolbar } from "./components/ProjectListToggle";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { OrgPermissionCan } from "@app/components/permissions";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCube, faCubes, faPlus } from "@fortawesome/free-solid-svg-icons";
import { MyNamespaceView } from "./components/MyNamespaceView";
import { ProjectType } from "@app/hooks/api/projects/types";
import { DropdownMenuTrigger } from "@radix-ui/react-dropdown-menu";
import { OrgPermissionNamespaceActions } from "@app/context/OrgPermissionContext/types";
import { AllNamespaceView } from "./components/AllNamespaceView";
import { NewNamespaceModal } from "@app/components/namespace";

// const formatDescription = (type: ProjectType) => {
//   if (type === ProjectType.SecretManager)
//     return "Securely store, manage, and rotate various application secrets, such as database credentials, API keys, etc.";
//   if (type === ProjectType.CertificateManager)
//     return "Manage your PKI infrastructure and issue digital certificates for services, applications, and devices.";
//   if (type === ProjectType.KMS)
//     return "Centralize the management of keys for cryptographic operations, such as encryption and decryption.";
//   if (type === ProjectType.SecretScanning)
//     return "Connect and monitor data sources to prevent secret leaks.";
//   return "Infisical SSH lets you issue SSH credentials to users for short-lived, secure SSH access to infrastructure.";
// };

export const ProjectsPage = () => {
  const { t } = useTranslation();

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
    "upgradePlan",
    "addNewNamespace"
  ] as const);

  const { subscription } = useSubscription();

  const isAddingProjectsAllowed = subscription?.workspaceLimit
    ? subscription.workspacesUsed < subscription.workspaceLimit
    : true;

  const isNamespaceActivated = subscription?.namespace;

  return (
    <div className="mx-auto flex max-w-7xl flex-col justify-start bg-bunker-800">
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.members.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <div className="mb-4 flex flex-col items-start justify-start">
        <PageHeader
          scope="org"
          title="Overview"
          description="Your team's complete security toolkit - organized and ready when you need them."
        />
      </div>
      <div>
        <Toolbar
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
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button
                colorSchema="secondary"
                leftIcon={<FontAwesomeIcon icon={faPlus} />}
                onClick={() => {
                  if (isAddingProjectsAllowed) {
                    handlePopUpOpen("addNewWs");
                  } else {
                    handlePopUpOpen("upgradePlan");
                  }
                }}
                className="ml-2"
              >
                Add New Resource
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent sideOffset={5} align="end">
              <OrgPermissionCan
                I={OrgPermissionActions.Create}
                an={OrgPermissionSubjects.Workspace}
              >
                {(isOldProjectV1Allowed) => (
                  <OrgPermissionCan
                    I={OrgPermissionActions.Create}
                    an={OrgPermissionSubjects.Project}
                  >
                    {(isAllowed) => (
                      <DropdownMenuItem
                        isDisabled={!isAllowed && !isOldProjectV1Allowed}
                        icon={<FontAwesomeIcon icon={faCube} />}
                        className="py-3"
                        onClick={() => {
                          if (isAddingProjectsAllowed) {
                            handlePopUpOpen("addNewWs");
                          } else {
                            handlePopUpOpen("upgradePlan");
                          }
                        }}
                      >
                        New Project
                      </DropdownMenuItem>
                    )}
                  </OrgPermissionCan>
                )}
              </OrgPermissionCan>
              <OrgPermissionCan
                I={OrgPermissionNamespaceActions.Create}
                an={OrgPermissionSubjects.Namespace}
              >
                {(isAllowed) => (
                  <DropdownMenuItem
                    isDisabled={!isAllowed}
                    icon={<FontAwesomeIcon icon={faCubes} />}
                    className="py-3"
                    onClick={() => {
                      if (isNamespaceActivated) {
                        handlePopUpOpen("addNewNamespace");
                      } else {
                        handlePopUpOpen("upgradePlan");
                      }
                    }}
                  >
                    New Namespace
                  </DropdownMenuItem>
                )}
              </OrgPermissionCan>
            </DropdownMenuContent>
          </DropdownMenu>
        </Toolbar>
      </div>
      <div className="mt-8">
        <div className="mb-4 flex items-center text-xl text-white">
          <FontAwesomeIcon icon={faCube} className="mr-2" />
          Organization Projects
        </div>
        {resourceListScope === ResourceListScopeFilter.Personal ? (
          <MyProjectView
            resourceViewMode={resourceViewMode}
            searchValue={searchFilter}
            projectTypeFilter={projectTypeFilter}
            orderDirection={orderDirection}
          />
        ) : (
          <AllProjectView searchValue={searchFilter} orderDirection={orderDirection} />
        )}
      </div>
      <div className="mt-8">
        <div className="mb-4 flex items-center text-xl text-white">
          <FontAwesomeIcon icon={faCubes} className="mr-2" />
          Namespaces
        </div>
        {resourceListScope === ResourceListScopeFilter.Personal ? (
          <MyNamespaceView
            resourceViewMode={resourceViewMode}
            searchValue={searchFilter}
            orderDirection={orderDirection}
          />
        ) : (
          <AllNamespaceView searchValue={searchFilter} orderDirection={orderDirection} />
        )}
      </div>
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
