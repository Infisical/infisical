import { motion } from "framer-motion";

import { OrgRoleTable } from "./OrgRoleTable";

export const OrgRoleTabSection = () => {
  return (
    <motion.div
      key="role-list"
      transition={{ duration: 0.15 }}
      initial={{ opacity: 0, translateX: 30 }}
      animate={{ opacity: 1, translateX: 0 }}
      exit={{ opacity: 0, translateX: 30 }}
    >
      <OrgRoleTable />
    </motion.div>
  );
};
