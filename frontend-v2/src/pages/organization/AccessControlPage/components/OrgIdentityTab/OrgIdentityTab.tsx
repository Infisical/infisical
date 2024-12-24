import { motion } from "framer-motion";

import { IdentitySection } from "./components";

export const OrgIdentityTab = () => {
  return (
    <motion.div
      key="panel-service-token"
      transition={{ duration: 0.15 }}
      initial={{ opacity: 0, translateX: 30 }}
      animate={{ opacity: 1, translateX: 0 }}
      exit={{ opacity: 0, translateX: 30 }}
    >
      <IdentitySection />
    </motion.div>
  );
};
