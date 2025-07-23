import { useEffect } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { faLock } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { ProjectPermissionSub, useSubscription } from "@app/context";
import { ProjectPermissionSecretScanningConfigActions } from "@app/context/ProjectPermissionContext/types";
import { usePopUp } from "@app/hooks";
import { ProjectGeneralTab } from "@app/pages/project/SettingsPage/components/ProjectGeneralTab";

import { ProjectScanningConfigTab } from "./components/ProjectScanningConfigTab";

export const SettingsPage = () => {
  const { t } = useTranslation();

  const { subscription } = useSubscription();

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);

  useEffect(() => {
    if (!subscription.secretScanning) {
      handlePopUpOpen("upgradePlan");
    }
  }, [subscription.secretScanning]);

  if (!subscription.secretScanning) {
    return (
      <>
        <div className="container mx-auto flex h-full items-center justify-center">
          <div className="flex items-end space-x-12 rounded-md bg-mineshaft-800 p-16 text-bunker-300">
            <div>
              <FontAwesomeIcon icon={faLock} size="6x" />
            </div>
            <div>
              <div className="mb-2 text-4xl font-medium">Access Restricted</div>
              <div className="text-sm">Upgrade your plan to access Secret Scanning</div>
            </div>
          </div>
        </div>
        <UpgradePlanModal
          isOpen={popUp.upgradePlan.isOpen}
          onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
          text="Secret Scanning is not available on your current plan."
        />
      </>
    );
  }

  return (
    <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.project.title") })}</title>
      </Helmet>
      <div className="w-full max-w-7xl">
        <PageHeader
          title="Settings"
          description="Configure your Secret Scanning product's configurations."
        />
        <Tabs defaultValue="tab-project-general">
          <TabList>
            <Tab value="tab-project-general">General</Tab>
            <Tab value="tab-project-secret-scanning">Scanning Settings</Tab>
          </TabList>
          <TabPanel value="tab-project-general">
            <ProjectGeneralTab />
          </TabPanel>
          <TabPanel value="tab-project-secret-scanning">
            <ProjectPermissionCan
              I={ProjectPermissionSecretScanningConfigActions.Read}
              a={ProjectPermissionSub.SecretScanningConfigs}
              renderGuardBanner
            >
              <ProjectScanningConfigTab />
            </ProjectPermissionCan>
          </TabPanel>
        </Tabs>
      </div>
    </div>
  );
};
