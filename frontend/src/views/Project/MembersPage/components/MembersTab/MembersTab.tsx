import { motion } from "framer-motion";

import { useWorkspace } from "@app/context";

import { GroupsSection } from "../GroupsTab/components";
import { MembersSection } from "./components";

export const MembersTab = () => {
  const { currentWorkspace } = useWorkspace();
  return (
    <motion.div
      key="panel-project-members"
      transition={{ duration: 0.15 }}
      initial={{ opacity: 0, translateX: 30 }}
      animate={{ opacity: 1, translateX: 0 }}
      exit={{ opacity: 0, translateX: 30 }}
    >
      <MembersSection />
      {currentWorkspace?.version && currentWorkspace.version > 1 && <GroupsSection />}
    </motion.div>
  );
};
