/* eslint-disable @typescript-eslint/no-unused-vars */
import { Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { withPermission } from "@app/hoc";

import {
  OrgMachineIdentityTab,
  OrgMembersTab,
  OrgRoleTabSection} from "./components";

enum TabSections {
  Member = "members",
  Roles = "roles",
  MachineIdentities = "machine-identities"
}

export const MembersPage = withPermission(
  () => {
    return (
      <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
        <div className="mb-6 w-full py-6 px-6 max-w-7xl mx-auto">
          <p className="mr-4 mb-4 text-3xl font-semibold text-white">
            Access Control
          </p>
          <Tabs defaultValue={TabSections.Member}>
            <TabList>
              <Tab value={TabSections.Member}>People</Tab>
              <Tab value={TabSections.MachineIdentities}>
                <div className="flex items-center">
                  <p>Machine Identities</p>
                  <div className="ml-2 rounded-md text-yellow text-sm inline-block bg-yellow/20 px-1.5 pb-[0.03rem] pt-[0.04rem] opacity-80 hover:opacity-100 cursor-default">
                    Beta
                  </div>
                </div>
              </Tab>
              <Tab value={TabSections.Roles}>Organization Roles</Tab>
            </TabList>
            <TabPanel value={TabSections.Member}>
              <OrgMembersTab />
            </TabPanel>
            <TabPanel value={TabSections.MachineIdentities}>
              <OrgMachineIdentityTab />
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
