/* eslint-disable @typescript-eslint/no-unused-vars */
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';

import { Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { withPermission } from "@app/hoc";
import { isTabSection, TabSections } from "@app/views/Org/Types";;

import { OrgIdentityTab, OrgMembersTab, OrgRoleTabSection } from "./components";

export const MembersPage = withPermission(
  () => {
    const router = useRouter();
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
        query: { ...router.query, selectedTab: tab },
      });
    }

    return (
      <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
        <div className="mx-auto mb-6 w-full max-w-7xl py-6 px-6">
          <p className="mr-4 mb-4 text-3xl font-semibold text-white">Organization Access Control</p>
          <Tabs value={activeTab} onValueChange={updateSelectedTab}>
            <TabList>
              <Tab value={TabSections.Member}>Users</Tab>
              <Tab value={TabSections.Identities}>
                <div className="flex items-center">
                  <p>Machine Identities</p>
                </div>
              </Tab>
            <Tab value={TabSections.Roles}>Organization Roles</Tab>
            </TabList>
            <TabPanel value={TabSections.Member}>
              <OrgMembersTab />
            </TabPanel>
            <TabPanel value={TabSections.Identities}>
              <OrgIdentityTab />
            </TabPanel>
            <TabPanel value={TabSections.Roles}>
              <OrgRoleTabSection />
            </TabPanel>
          </Tabs>
        </div>
      </div>
    );
  },
  { action: OrgPermissionActions.Read, subject: OrgPermissionSubjects.Member }
);
