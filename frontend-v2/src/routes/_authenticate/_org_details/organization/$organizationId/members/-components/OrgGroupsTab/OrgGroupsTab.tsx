import { motion } from "framer-motion";

import { OrgGroupsSection } from "./components";

export const OrgGroupsTab = () => {
  return (
    <motion.div
      key="panel-org-groups"
      transition={{ duration: 0.15 }}
      initial={{ opacity: 0, translateX: 30 }}
      animate={{ opacity: 1, translateX: 0 }}
      exit={{ opacity: 0, translateX: 30 }}
    >
      <OrgGroupsSection />
    </motion.div>
  );
};
