/* eslint-disable @typescript-eslint/no-unused-vars */
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";

import { Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useGetRoles } from "@app/hooks/api";
import { TRole } from "@app/hooks/api/roles/types";

import { MemberListTab } from "./components/MemberListTab";
import { ProjectRoleListTab } from "./components/ProjectRoleListTab";

enum TabSections {
  Member = "members",
  Roles = "roles"
}

export const MembersPage = () => {
  const { t } = useTranslation();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?._id || "";
  const orgId = currentWorkspace?.organization || "";

  const { data: roles, isLoading: isRolesLoading } = useGetRoles({
    orgId,
    workspaceId
  });

  return (
    <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      <div className="mb-6 w-full py-6 px-6 max-w-7xl mx-auto">
        <p className="mr-4 mb-4 text-3xl font-semibold text-white">{t("settings.members.title")}</p>
        <Tabs defaultValue={TabSections.Member}>
          <TabList>
            <Tab value={TabSections.Member}>Members</Tab>
            {process.env.NEXT_PUBLIC_NEW_PERMISSION_FLAG === "true" && (
              <Tab value={TabSections.Roles}>Roles</Tab>
            )}
          </TabList>
          <TabPanel value={TabSections.Member}>
            <motion.div
              key="panel-1"
              transition={{ duration: 0.15 }}
              initial={{ opacity: 0, translateX: 30 }}
              animate={{ opacity: 1, translateX: 0 }}
              exit={{ opacity: 0, translateX: 30 }}
            >
              <MemberListTab roles={roles as TRole<string>[]} />
            </motion.div>
          </TabPanel>
          <TabPanel value={TabSections.Roles}>
            <ProjectRoleListTab roles={roles as TRole<string>[]} isRolesLoading={isRolesLoading} />
          </TabPanel>
        </Tabs>
      </div>
    </div>
  );
};
