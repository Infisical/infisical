/* eslint-disable @typescript-eslint/no-unused-vars */
import { motion } from "framer-motion";

import { Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { withProjectPermission } from "@app/hoc";

import {
  IdentityTab,
  MemberListTab,
  ProjectRoleListTab,
  ServiceTokenTab
} from "./components";

enum TabSections {
  Member = "members",
  Roles = "roles",
  Identities = "identities",
  ServiceTokens = "service-tokens"
}

export const MembersPage = withProjectPermission(
  () => {
    return (
      <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
        <div className="mb-6 w-full py-6 px-6 max-w-7xl mx-auto">
          <p className="mr-4 mb-4 text-3xl font-semibold text-white">
            Project Access Control
          </p>
          <Tabs defaultValue={TabSections.Member}>
            <TabList>
              <Tab value={TabSections.Member}>People</Tab>
              <Tab value={TabSections.Identities}>
                <div className="flex items-center">
                  <p>Machine Identities</p>
                  <div className="ml-2 rounded-md text-yellow text-sm inline-block bg-yellow/20 px-1.5 pb-[0.03rem] pt-[0.04rem] opacity-80 hover:opacity-100 cursor-default">
                    New
                  </div>
                </div>
              </Tab>
              <Tab value={TabSections.ServiceTokens}>Service Tokens</Tab>
              <Tab value={TabSections.Roles}>Project Roles</Tab>
            </TabList>
            <TabPanel value={TabSections.Member}>
              <motion.div
                key="panel-1"
                transition={{ duration: 0.15 }}
                initial={{ opacity: 0, translateX: 30 }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={{ opacity: 0, translateX: 30 }}
              >
                <MemberListTab />
              </motion.div>
            </TabPanel>
            <TabPanel value={TabSections.Identities}>
              <IdentityTab />
            </TabPanel>
            <TabPanel value={TabSections.ServiceTokens}>
              <ServiceTokenTab />
            </TabPanel>
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
