/* eslint-disable @typescript-eslint/no-unused-vars */
import { Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { withPermission } from "@app/hoc";

import { OrgIdentityTab, OrgMembersTab, OrgRoleTabSection } from "./components";

enum TabSections {
  Member = "members",
  Roles = "roles",
  Identities = "identities"
}

export const MembersPage = withPermission(
  () => {
    return (
      <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
        <div className="mx-auto mb-6 w-full max-w-7xl py-6 px-6">
          <p className="mr-4 mb-4 text-3xl font-semibold text-white">Organization Access Control</p>
          <Tabs defaultValue={TabSections.Member}>
            <TabList>
              <Tab value={TabSections.Member}>People</Tab>
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
