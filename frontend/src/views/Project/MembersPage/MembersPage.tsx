/* eslint-disable @typescript-eslint/no-unused-vars */
import { useEffect, useState } from "react";
import { useRouter } from "next/router";

import { Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { getProjectTitle } from "@app/helpers/project";
import { withProjectPermission } from "@app/hoc";
import { ProjectType } from "@app/hooks/api/workspace/types";

import { isTabSection, TabSections } from "../Types";
import {
  GroupsTab,
  IdentityTab,
  MembersTab,
  ProjectRoleListTab,
  ServiceTokenTab
} from "./components";

export const MembersPage = withProjectPermission(
  () => {
    const router = useRouter();
    const { currentWorkspace } = useWorkspace();
    const { query } = router;
    const selectedTab = query.selectedTab as string;
    const [activeTab, setActiveTab] = useState<TabSections>(TabSections.Member);

    useEffect(() => {
      if (selectedTab && isTabSection(selectedTab)) {
        setActiveTab(selectedTab);
      }
    }, [isTabSection, selectedTab]);

    const updateSelectedTab = (tab: string) => {
      router.push({
        pathname: router.pathname,
        query: { ...router.query, selectedTab: tab }
      });
    };

    return (
      <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
        <div className="mx-auto mb-6 w-full max-w-7xl py-6 px-6">
          <p className="mr-4 mb-4 text-3xl font-semibold text-white">
            {currentWorkspace?.type ? getProjectTitle(currentWorkspace?.type) : "Project"}
            Access Control
          </p>
          <Tabs value={activeTab} onValueChange={updateSelectedTab}>
            <TabList>
              <Tab value={TabSections.Member}>Users</Tab>
              <Tab value={TabSections.Groups}>Groups</Tab>
              <Tab value={TabSections.Identities}>
                <div className="flex items-center">
                  <p>Machine Identities</p>
                </div>
              </Tab>
              <Tab value={TabSections.ServiceTokens}>Service Tokens</Tab>
              <Tab value={TabSections.Roles}>Project Roles</Tab>
            </TabList>
            <TabPanel value={TabSections.Member}>
              <MembersTab />
            </TabPanel>
            <TabPanel value={TabSections.Groups}>
              <GroupsTab />
            </TabPanel>
            <TabPanel value={TabSections.Identities}>
              <IdentityTab />
            </TabPanel>
            {currentWorkspace?.type === ProjectType.SecretManager && (
              <TabPanel value={TabSections.ServiceTokens}>
                <ServiceTokenTab />
              </TabPanel>
            )}
            <TabPanel value={TabSections.Roles}>
              <ProjectRoleListTab />
            </TabPanel>
          </Tabs>
        </div>
      </div>
    );
  },
  { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.Member }
);
