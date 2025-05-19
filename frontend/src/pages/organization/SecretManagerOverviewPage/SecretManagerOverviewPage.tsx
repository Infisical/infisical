// REFACTOR(akhilmhdh): This file needs to be split into multiple components too complex
import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { faExclamationCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { NewProjectModal } from "@app/components/projects";
import { PageHeader } from "@app/components/v2";
import { useSubscription } from "@app/context";
import { useFetchServerStatus } from "@app/hooks/api/serverDetails";
import { ProjectType } from "@app/hooks/api/workspace/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { AllProjectView } from "./components/AllProjectView";
import { MyProjectView } from "./components/MyProjectView";
import { ProjectListToggle, ProjectListView } from "./components/ProjectListToggle";

const formatDescription = (type: ProjectType) => {
  if (type === ProjectType.SecretManager)
    return "Securely store, manage, and rotate various application secrets, such as database credentials, API keys, etc.";
  if (type === ProjectType.CertificateManager)
    return "Manage your PKI infrastructure and issue digital certificates for services, applications, and devices.";
  if (type === ProjectType.KMS)
    return "Centralize the management of keys for cryptographic operations, such as encryption and decryption.";
  if (type === ProjectType.SecretScanning)
    return "Connect and monitor data sources to prevent secret leaks.";
  return "Infisical SSH lets you issue SSH credentials to users for short-lived, secure SSH access to infrastructure.";
};

type Props = {
  type: ProjectType;
};

// #TODO: Update all the workspaceIds
export const ProductOverviewPage = ({ type }: Props) => {
  const { t } = useTranslation();

  const [projectListView, setProjectListView] = useState(ProjectListView.MyProjects);

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "addNewWs",
    "upgradePlan"
  ] as const);

  const { data: serverDetails } = useFetchServerStatus();
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
      {!serverDetails?.redisConfigured && (
        <div className="mb-4 flex flex-col items-start justify-start text-3xl">
          <p className="mb-4 mr-4 font-semibold text-white">Announcements</p>
          <div className="flex w-full items-center rounded-md border border-blue-400/70 bg-blue-900/70 p-2 text-base text-mineshaft-100">
            <FontAwesomeIcon
              icon={faExclamationCircle}
              className="mr-4 p-4 text-2xl text-mineshaft-50"
            />
            Attention: Updated versions of Infisical now require Redis for full functionality. Learn
            how to configure it
            <a
              href="https://infisical.com/docs/self-hosting/configuration/redis"
              rel="noopener noreferrer"
              target="_blank"
            >
              <span className="cursor-pointer pl-1 text-white underline underline-offset-2 duration-100 hover:text-blue-200 hover:decoration-blue-400">
                here
              </span>
            </a>
            .
          </div>
        </div>
      )}
      <div className="mb-4 flex flex-col items-start justify-start">
        <PageHeader
          title={
            <div className="flex items-center gap-4">
              <ProjectListToggle value={projectListView} onChange={setProjectListView} />
            </div>
          }
          description={formatDescription(type)}
        />
      </div>
      {projectListView === ProjectListView.MyProjects ? (
        <MyProjectView
          type={type}
          onAddNewProject={() => handlePopUpOpen("addNewWs")}
          onUpgradePlan={() => handlePopUpOpen("upgradePlan")}
          isAddingProjectsAllowed={isAddingProjectsAllowed}
        />
      ) : (
        <AllProjectView
          type={type}
          onAddNewProject={() => handlePopUpOpen("addNewWs")}
          onUpgradePlan={() => handlePopUpOpen("upgradePlan")}
          isAddingProjectsAllowed={isAddingProjectsAllowed}
        />
      )}
      <NewProjectModal
        isOpen={popUp.addNewWs.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addNewWs", isOpen)}
        projectType={type}
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="You have exceeded the number of projects allowed on the free plan."
      />
    </div>
  );
};

export const SecretManagerOverviewPage = () => (
  <ProductOverviewPage type={ProjectType.SecretManager} />
);
