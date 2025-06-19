import { motion } from "framer-motion";

import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { withProjectPermission } from "@app/hoc";

import { ProjectRoleList } from "./components/ProjectRoleList";

export const ProjectRoleListTab = withProjectPermission(
  () => {
    return (
      <motion.div
        key="role-list"
        transition={{ duration: 0.15 }}
        initial={{ opacity: 0, translateX: 30 }}
        animate={{ opacity: 1, translateX: 0 }}
        exit={{ opacity: 0, translateX: 30 }}
      >
        <ProjectRoleList />
      </motion.div>
    );
  },
  { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.Role }
);
