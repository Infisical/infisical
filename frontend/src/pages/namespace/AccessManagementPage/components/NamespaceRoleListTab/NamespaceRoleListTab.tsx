import { motion } from "framer-motion";

import {
  NamespacePermissionActions,
  NamespacePermissionSubjects
} from "@app/context/NamespacePermissionContext/types";
import { withNamespacePermission } from "@app/hoc";

import { NamespaceRoleList } from "./components/NamespaceRoleList";

export const NamespaceRoleListTab = withNamespacePermission(
  () => {
    return (
      <motion.div
        key="role-list"
        transition={{ duration: 0.15 }}
        initial={{ opacity: 0, translateX: 30 }}
        animate={{ opacity: 1, translateX: 0 }}
        exit={{ opacity: 0, translateX: 30 }}
      >
        <NamespaceRoleList />
      </motion.div>
    );
  },
  { action: NamespacePermissionActions.Read, subject: NamespacePermissionSubjects.Role }
);
