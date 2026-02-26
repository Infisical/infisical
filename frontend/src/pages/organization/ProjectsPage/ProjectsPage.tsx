// REFACTOR(akhilmhdh): This file needs to be split into multiple components too complex
import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Outlet, useMatches } from "@tanstack/react-router";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { NewProjectModal } from "@app/components/projects";
import { PageHeader } from "@app/components/v2";
import { useOrganization, useSubscription } from "@app/context";
import { usePopUp } from "@app/hooks/usePopUp";

import { AllProjectView } from "./components/AllProjectView";
import { MyProjectView } from "./components/MyProjectView";
import { ProjectListView } from "./components/ProjectListToggle";

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
      match.pathname.includes("/ai/") ||
      match.pathname.includes("/nexus/")
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
    "upgradePlan"
  ] as const);

  const { subscription } = useSubscription();
  const { isSubOrganization } = useOrganization();
  const isAddingProjectsAllowed = subscription?.workspaceLimit
    ? subscription.workspacesUsed < subscription.workspaceLimit
    : true;

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
      {projectView}
      <NewProjectModal
        isOpen={popUp.addNewWs.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addNewWs", isOpen)}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="You have reached the maximum number of projects allowed on your current plan. Upgrade to Infisical Pro plan to add more projects."
      />
    </div>
  );
};
