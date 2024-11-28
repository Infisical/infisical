import { motion } from "framer-motion";

import { OrgMembersSection } from "./components";

export const OrgMembersTab = () => {
  return (
    <motion.div
      key="panel-org-members"
      transition={{ duration: 0.15 }}
      initial={{ opacity: 0, translateX: 30 }}
      animate={{ opacity: 1, translateX: 0 }}
      exit={{ opacity: 0, translateX: 30 }}
    >
      <OrgMembersSection />
    </motion.div>
  );
};
