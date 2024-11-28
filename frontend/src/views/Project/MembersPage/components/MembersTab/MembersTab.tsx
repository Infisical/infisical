import { motion } from "framer-motion";

import { MembersSection } from "./components";

export const MembersTab = () => {
  return (
    <motion.div
      key="panel-project-members"
      transition={{ duration: 0.15 }}
      initial={{ opacity: 0, translateX: 30 }}
      animate={{ opacity: 1, translateX: 0 }}
      exit={{ opacity: 0, translateX: 30 }}
    >
      <MembersSection />
    </motion.div>
  );
};
