import { motion } from "framer-motion";

import { usePopUp } from "@app/hooks";
import { TOrgRole } from "@app/hooks/api/roles/types";

import { OrgRoleModifySection } from "./OrgRoleModifySection";
import { OrgRoleTable } from "./OrgRoleTable";

export const OrgRoleTabSection = () => {
  const { popUp, handlePopUpClose } = usePopUp(["editRole"] as const);
  return popUp.editRole.isOpen ? (
    <motion.div
      key="role-modify"
      transition={{ duration: 0.1 }}
      initial={{ opacity: 0, translateX: 30 }}
      animate={{ opacity: 1, translateX: 0 }}
      exit={{ opacity: 0, translateX: 30 }}
    >
      <OrgRoleModifySection
        role={popUp.editRole.data as TOrgRole}
        onGoBack={() => handlePopUpClose("editRole")}
      />
    </motion.div>
  ) : (
    <motion.div
      key="role-list"
      transition={{ duration: 0.1 }}
      initial={{ opacity: 0, translateX: -30 }}
      animate={{ opacity: 1, translateX: 0 }}
      exit={{ opacity: 0, translateX: -30 }}
    >
      <OrgRoleTable />
    </motion.div>
  );
};
