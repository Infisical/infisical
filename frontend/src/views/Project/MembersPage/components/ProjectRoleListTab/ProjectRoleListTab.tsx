import { motion } from "framer-motion";

import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { withProjectPermission } from "@app/hoc";
import { usePopUp } from "@app/hooks";
import { TRole } from "@app/hooks/api/roles/types";

import { ProjectRoleList } from "./components/ProjectRoleList";
import { ProjectRoleModifySection } from "./components/ProjectRoleModifySection";

export const ProjectRoleListTab = withProjectPermission(
  () => {
    const { popUp, handlePopUpOpen, handlePopUpClose } = usePopUp(["editRole"] as const);

    return popUp.editRole.isOpen ? (
      <motion.div
        key="role-modify"
        transition={{ duration: 0.1 }}
        initial={{ opacity: 0, translateX: 30 }}
        animate={{ opacity: 1, translateX: 0 }}
        exit={{ opacity: 0, translateX: 30 }}
      >
        <ProjectRoleModifySection
          role={popUp.editRole.data as TRole<string>}
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
        <ProjectRoleList onSelectRole={(role) => handlePopUpOpen("editRole", role)} />
      </motion.div>
    );
  },
  { action: ProjectPermissionActions.Read, subject: ProjectPermissionSub.Role }
);
