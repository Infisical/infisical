import { motion } from "framer-motion";

import { OrgIdentityGroupsSection } from "./components";

export const OrgIdentityGroupsTab = () => {
  return (
    <motion.div
      key="panel-org-groups"
      transition={{ duration: 0.15 }}
      initial={{ opacity: 0, translateX: 30 }}
      animate={{ opacity: 1, translateX: 0 }}
      exit={{ opacity: 0, translateX: 30 }}
    >
      <OrgIdentityGroupsSection />
    </motion.div>
  );
};
