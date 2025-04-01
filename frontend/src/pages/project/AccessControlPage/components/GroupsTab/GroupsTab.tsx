import { motion } from "framer-motion";

import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { withProjectPermission } from "@app/hoc";

import { GroupsSection } from "./components";

export const GroupsTab = withProjectPermission(
  () => {
    return (
      <motion.div
        key="panel-groups"
        transition={{ duration: 0.15 }}
        initial={{ opacity: 0, translateX: 30 }}
        animate={{ opacity: 1, translateX: 0 }}
        exit={{ opacity: 0, translateX: 30 }}
      >
        <GroupsSection />
      </motion.div>
    );
  },
  {
    action: ProjectPermissionActions.Read,
    subject: ProjectPermissionSub.Groups
  }
);
