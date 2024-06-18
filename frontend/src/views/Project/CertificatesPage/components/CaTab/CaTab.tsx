import { motion } from "framer-motion";

import { CaSection } from "./components";

export const CaTab = () => {
  return (
    <motion.div
      key="panel-certificate-authorities"
      transition={{ duration: 0.15 }}
      initial={{ opacity: 0, translateX: 30 }}
      animate={{ opacity: 1, translateX: 0 }}
      exit={{ opacity: 0, translateX: 30 }}
    >
      <CaSection />
    </motion.div>
  );
};
