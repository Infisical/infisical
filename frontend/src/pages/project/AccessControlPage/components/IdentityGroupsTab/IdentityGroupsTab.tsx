import { motion } from "framer-motion";

import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { withProjectPermission } from "@app/hoc";

import { IdentityGroupsSection } from "./components";

export const IdentityGroupsTab = withProjectPermission(
  () => {
    return (
      <motion.div
        key="panel-identity-groups"
        transition={{ duration: 0.15 }}
        initial={{ opacity: 0, translateX: 30 }}
        animate={{ opacity: 1, translateX: 0 }}
        exit={{ opacity: 0, translateX: 30 }}
      >
        <IdentityGroupsSection />
      </motion.div>
    );
  },
  {
    action: ProjectPermissionActions.Read,
    subject: ProjectPermissionSub.IdentityGroups
  }
);
