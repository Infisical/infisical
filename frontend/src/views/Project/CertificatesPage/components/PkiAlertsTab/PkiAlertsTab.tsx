import { motion } from "framer-motion";

import { PkiAlertsSection } from "./components";

export const PkiAlertsTab = () => {
  return (
    <motion.div
      key="panel-alerts"
      transition={{ duration: 0.15 }}
      initial={{ opacity: 0, translateX: 30 }}
      animate={{ opacity: 1, translateX: 0 }}
      exit={{ opacity: 0, translateX: 30 }}
    >
      <PkiAlertsSection />
    </motion.div>
  );
};
