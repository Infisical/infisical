/* eslint-disable @typescript-eslint/no-unused-vars */
import { motion } from "framer-motion";

import { Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { withProjectPermission } from "@app/hoc";

import { GroupsTab, IdentityTab, MemberListTab, ProjectRoleListTab, ServiceTokenTab } from "./components";

enum TabSections {
  Member = "members",
  Roles = "roles",
  Groups = "groups",
  Identities = "identities",
  ServiceTokens = "service-tokens"
}

export const MembersPage = withProjectPermission(
  () => {
    const { currentWorkspace } = useWorkspace();
    console.log("currentWorkspace: ", currentWorkspace);

    return (
      <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
        <div className="mx-auto mb-6 w-full max-w-7xl py-6 px-6">
          <p className="mr-4 mb-4 text-3xl font-semibold text-white">Project Access Control</p>
          <Tabs defaultValue={TabSections.Member}>
            <TabList>
              <Tab value={TabSections.Member}>People</Tab>
              {currentWorkspace?.version && currentWorkspace.version > 1 && (
                <Tab value={TabSections.Groups}>Groups</Tab>
              )}
              <Tab value={TabSections.Identities}>
                <div className="flex items-center">
                  <p>Machine Identities</p>
                </div>
              </Tab>
              <Tab value={TabSections.ServiceTokens}>Service Tokens</Tab>
              <Tab value={TabSections.Roles}>Project Roles</Tab>
            </TabList>
            <TabPanel value={TabSections.Member}>
              <MemberListTab />
            </TabPanel>
            {currentWorkspace?.version && currentWorkspace.version > 1 && (
              <TabPanel value={TabSections.Groups}>
                <motion.div
                  key="panel-1"
                  transition={{ duration: 0.15 }}
                  initial={{ opacity: 0, translateX: 30 }}
                  animate={{ opacity: 1, translateX: 0 }}
                  exit={{ opacity: 0, translateX: 30 }}
                >
                  <GroupsTab />
                </motion.div>
              </TabPanel>
            )}
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
