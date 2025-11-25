import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { InfoIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useOrganization } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectGeneralTab } from "@app/pages/project/SettingsPage/components/ProjectGeneralTab";

import { ProjectSshTab } from "./components/ProjectSshTab";

export const SettingsPage = () => {
  const { t } = useTranslation();

  const { currentOrg } = useOrganization();

  return (
    <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.project.title") })}</title>
      </Helmet>
      <div className="w-full max-w-8xl">
        <PageHeader
          scope={ProjectType.SSH}
          title="Project Settings"
          description="Configure your SSH product's configurations."
        >
          <Link
            to="/organizations/$orgId/settings"
            params={{
              orgId: currentOrg.id
            }}
            className="flex items-center gap-x-1.5 text-xs whitespace-nowrap text-neutral hover:underline"
          >
            <InfoIcon size={12} /> Looking for organization settings?
          </Link>
        </PageHeader>
        <Tabs orientation="vertical" defaultValue="tab-project-general">
          <TabList>
            <Tab variant="project" value="tab-project-general">
              General
            </Tab>
            <Tab variant="project" value="tab-ssh-settings">
              SSH Settings
            </Tab>
          </TabList>
          <TabPanel value="tab-project-general">
            <ProjectGeneralTab />
          </TabPanel>
          <TabPanel value="tab-ssh-settings">
            <ProjectPermissionCan
              I={ProjectPermissionActions.Edit}
              a={ProjectPermissionSub.Project}
              renderGuardBanner
            >
              <ProjectSshTab />
            </ProjectPermissionCan>
          </TabPanel>
        </Tabs>
      </div>
    </div>
  );
};
