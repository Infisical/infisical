// REFACTOR(akhilmhdh): This file needs to be split into multiple components too complex
import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Outlet, useMatches, useNavigate, useSearch } from "@tanstack/react-router";

import { ROUTE_PATHS } from "@app/const/routes";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { NewProjectModal } from "@app/components/projects";
import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { useOrganization, useSubscription } from "@app/context";
import { usePopUp } from "@app/hooks/usePopUp";

import { AllProjectView } from "./components/AllProjectView";
import { MyProjectView } from "./components/MyProjectView";
import { ProjectListView } from "./components/ProjectListToggle";
import { SubOrgsView } from "./components/SubOrgsView";

const TAB_PROJECTS = "tab-projects";
const TAB_SUB_ORGS = "tab-sub-organizations";

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
  const matches = useMatches();

  const hasChildRoute = matches.some(
    (match) =>
      match.pathname.includes("/secret-management/") ||
      match.pathname.includes("/cert-manager/") ||
      match.pathname.includes("/kms/") ||
      match.pathname.includes("/pam/") ||
      match.pathname.includes("/ssh/") ||
      match.pathname.includes("/secret-scanning/") ||
      match.pathname.includes("/ai/")
  );

  const [projectListView, setProjectListView] = useState<ProjectListView>(() => {
    const storedView = localStorage.getItem("projectListView");

    if (
      storedView &&
      (storedView === ProjectListView.AllProjects || storedView === ProjectListView.MyProjects)
    ) {
      return storedView;
    }

    return ProjectListView.MyProjects;
  });

  const handleSetProjectListView = (value: ProjectListView) => {
    localStorage.setItem("projectListView", value);
    setProjectListView(value);
  };

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "addNewWs",
    "upgradePlan",
    "upgradeSubOrgs"
  ] as const);

  const { subscription } = useSubscription();
  const { isSubOrganization, isRootOrganization } = useOrganization();
  const isAddingProjectsAllowed = subscription?.workspaceLimit
    ? subscription.workspacesUsed < subscription.workspaceLimit
    : true;

  const search = useSearch({ from: ROUTE_PATHS.Organization.ProjectsPage.id });
  const navigate = useNavigate({ from: ROUTE_PATHS.Organization.ProjectsPage.path });
  const selectedTab = search.selectedTab || TAB_PROJECTS;

  const handleTabChange = (tab: string) => {
    if (tab === TAB_SUB_ORGS && !subscription?.subOrganization) {
      handlePopUpOpen("upgradeSubOrgs");
      return;
    }
    navigate({ search: (prev) => ({ ...prev, selectedTab: tab === TAB_PROJECTS ? "" : tab }) });
  };

  if (hasChildRoute) {
    return <Outlet />;
  }

  const projectViewProps = {
    onAddNewProject: () => handlePopUpOpen("addNewWs"),
    onUpgradePlan: () => handlePopUpOpen("upgradePlan"),
    isAddingProjectsAllowed,
    projectListView,
    onProjectListViewChange: handleSetProjectListView
  };

  const projectView =
    projectListView === ProjectListView.MyProjects ? (
      <MyProjectView {...projectViewProps} />
    ) : (
      <AllProjectView {...projectViewProps} />
    );

  return (
    <div className="mx-auto flex max-w-8xl flex-col justify-start bg-bunker-800">
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.members.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <PageHeader
        scope={isSubOrganization ? "namespace" : "org"}
        title={`${isSubOrganization ? "Sub-Organization" : "Organization"} Overview`}
        description="Your team's complete security toolkit - organized and ready when you need them."
      />
      {isRootOrganization ? (
        <Tabs orientation="vertical" value={selectedTab} onValueChange={handleTabChange}>
          <TabList>
            <Tab value={TAB_PROJECTS} variant="org">
              Projects
            </Tab>
            <Tab value={TAB_SUB_ORGS} variant="org">
              Sub Orgs
            </Tab>
          </TabList>
          <TabPanel value={TAB_PROJECTS}>{projectView}</TabPanel>
          <TabPanel value={TAB_SUB_ORGS}>
            <SubOrgsView />
          </TabPanel>
        </Tabs>
      ) : (
        projectView
      )}
      <NewProjectModal
        isOpen={popUp.addNewWs.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addNewWs", isOpen)}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="You have reached the maximum number of projects allowed on your current plan. Upgrade to Infisical Pro plan to add more projects."
      />
      <UpgradePlanModal
        isOpen={popUp.upgradeSubOrgs.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradeSubOrgs", isOpen)}
        text="Sub-organizations are not available on your current plan. Upgrade to Infisical's Enterprise plan to create and manage sub-organizations."
      />
    </div>
  );
};
