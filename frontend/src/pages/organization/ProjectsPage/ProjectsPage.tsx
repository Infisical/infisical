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
      match.pathname.includes("/cert-management/") ||
      match.pathname.includes("/kms/") ||
      match.pathname.includes("/pam/") ||
      match.pathname.includes("/ssh/") ||
      match.pathname.includes("/secret-scanning/")
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
      {projectListView === ProjectListView.MyProjects ? (
        <MyProjectView
          onAddNewProject={() => handlePopUpOpen("addNewWs")}
          onUpgradePlan={() => handlePopUpOpen("upgradePlan")}
          isAddingProjectsAllowed={isAddingProjectsAllowed}
          projectListView={projectListView}
          onProjectListViewChange={handleSetProjectListView}
        />
      ) : (
        <AllProjectView
          onAddNewProject={() => handlePopUpOpen("addNewWs")}
          onUpgradePlan={() => handlePopUpOpen("upgradePlan")}
          isAddingProjectsAllowed={isAddingProjectsAllowed}
          projectListView={projectListView}
          onProjectListViewChange={handleSetProjectListView}
        />
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
    </div>
  );
};
