/* eslint-disable @typescript-eslint/no-unused-vars */
import { Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/context";
import { withPermission } from "@app/hoc";

import {
  OrgMembersTab,
  OrgRoleTabSection,
  OrgServiceTokenTab
} from "./components";

enum TabSections {
  Member = "members",
  Roles = "roles",
  ServiceTokens = "service-tokens"
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
              <Tab value={TabSections.ServiceTokens}>Machine Identities</Tab>
              <Tab value={TabSections.Roles}>Roles</Tab>
            </TabList>
            <TabPanel value={TabSections.Member}>
              <OrgMembersTab />
            </TabPanel>
            <TabPanel value={TabSections.ServiceTokens}>
              <OrgServiceTokenTab />
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
