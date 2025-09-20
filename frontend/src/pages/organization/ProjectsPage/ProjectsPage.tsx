import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { NewProjectModal } from "@app/components/projects";
import { PageHeader } from "@app/components/v2";
import { useSubscription } from "@app/context";
import { usePopUp } from "@app/hooks/usePopUp";

import { AllProjectView } from "./components/AllProjectView";
import { MyProjectView } from "./components/MyProjectView";
import { ProjectListView } from "./components/ProjectListToggle";
import { NewNamespaceModal } from "@app/components/namespaces";
import { NamespaceListView } from "./components/NamespacetListToggle";
import { MyNamespaceView } from "./components/MyNamespaceView";
import { AllNamespaceView } from "./components/AllNamespaceView";

export const ProjectsPage = () => {
  const { t } = useTranslation();

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

  const [namespaceListView, setNamespaceListView] = useState<NamespaceListView>(() => {
    const storedView = localStorage.getItem("namespaceListView");

    if (
      storedView &&
      (storedView === NamespaceListView.AllNamespaces ||
        storedView === NamespaceListView.MyNamespaces)
    ) {
      return storedView;
    }

    return NamespaceListView.MyNamespaces;
  });

  const handleSetProjectListView = (value: ProjectListView) => {
    localStorage.setItem("projectListView", value);
    setProjectListView(value);
  };

  const handleSetNamespaceListView = (value: NamespaceListView) => {
    localStorage.setItem("namespaceListView", value);
    setNamespaceListView(value);
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
        {shouldRenderNamespaces && (
          <PageHeader
            title={shouldRenderNamespaces ? "Overview" : "Projects"}
            description={
              shouldRenderNamespaces
                ? "Your team's complete security toolkit - workspaces and organization level projects"
                : "Your team's complete security toolkit - organized and ready when you need them."
            }
          />
        )}
      </div>
      {shouldRenderNamespaces && (
        <div>
          <div className="mb-2">
            <div className="text-lg font-medium text-white">Namespaces</div>
            <div className="text-sm text-mineshaft-300">
              Organize projects with scoped access control
            </div>
          </div>
          {namespaceListView === NamespaceListView.MyNamespaces ? (
            <MyNamespaceView
              onAddNewNamespace={() => handlePopUpOpen("addNewNamespace")}
              onUpgradePlan={() => handlePopUpOpen("upgradePlan")}
              isAddingNamespacesAllowed={subscription.namespace}
              namespaceListView={namespaceListView}
              onNamespaceListViewChange={handleSetNamespaceListView}
            />
          ) : (
            <AllNamespaceView
              onAddNewNamespace={() => handlePopUpOpen("addNewNamespace")}
              onUpgradePlan={() => handlePopUpOpen("upgradePlan")}
              isAddingNamespacesAllowed={subscription.namespace}
              namespaceListView={namespaceListView}
              onNamespaceListViewChange={handleSetNamespaceListView}
            />
          )}
        </div>
      )}
      {shouldRenderNamespaces && (
        <div className="mb-2 mt-8">
          <div className="text-lg font-medium text-white">Organization Projects</div>
          <div className="text-sm text-mineshaft-300">
            Projects available across the entire organization
          </div>
        </div>
      )}
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
