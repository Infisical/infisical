import { useEffect } from "react";
import {
  faBook,
  faBoxOpen,
  faCog,
  faDisplay,
  faHome,
  faUser,
  faUsers
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, Outlet } from "@tanstack/react-router";
import { motion } from "framer-motion";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { Lottie, Menu, MenuGroup, MenuItem } from "@app/components/v2";
import { useProject, useProjectPermission, useSubscription } from "@app/context";
import { usePopUp } from "@app/hooks";

import { AssumePrivilegeModeBanner } from "../ProjectLayout/components/AssumePrivilegeModeBanner";

export const PamLayout = () => {
  const { currentProject } = useProject();
  const { subscription } = useSubscription();
  const { assumedPrivilegeDetails } = useProjectPermission();

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"]);

  useEffect(() => {
    if (subscription && !subscription.pam) {
      handlePopUpOpen("upgradePlan");
    }
  }, [subscription]);

  return (
    <>
      <div className="dark hidden h-full w-full flex-col overflow-x-hidden md:flex">
        <div className="flex grow flex-col overflow-y-hidden md:flex-row">
          <motion.div
            key="menu-project-items"
            initial={{ x: -150 }}
            animate={{ x: 0 }}
            exit={{ x: -150 }}
            transition={{ duration: 0.2 }}
            className="dark w-full border-r border-mineshaft-600 bg-linear-to-tr from-mineshaft-700 via-mineshaft-800 to-mineshaft-900 md:w-60"
          >
            <nav className="items-between flex h-full flex-col overflow-y-auto dark:scheme-dark">
              <div className="flex items-center gap-3 border-b border-mineshaft-600 px-4 py-3.5 text-lg text-white">
                <Lottie className="inline-block h-5 w-5 shrink-0" icon="groups" />
                PAM
              </div>
              <div className="flex-1">
                <Menu>
                  <MenuGroup title="Resources">
                    <Link
                      to="/projects/pam/$projectId/accounts"
                      params={{
                        projectId: currentProject.id
                      }}
                    >
                      {({ isActive }) => (
                        <MenuItem variant="project" isSelected={isActive}>
                          <div className="mx-1 flex gap-2">
                            <div className="w-6">
                              <FontAwesomeIcon icon={faUser} />
                            </div>
                            Accounts
                          </div>
                        </MenuItem>
                      )}
                    </Link>
                    <Link
                      to="/projects/pam/$projectId/resources"
                      params={{
                        projectId: currentProject.id
                      }}
                    >
                      {({ isActive }) => (
                        <MenuItem variant="project" isSelected={isActive}>
                          <div className="mx-1 flex gap-2">
                            <div className="w-6">
                              <FontAwesomeIcon icon={faBoxOpen} />
                            </div>
                            Resources
                          </div>
                        </MenuItem>
                      )}
                    </Link>
                    <Link
                      to="/projects/pam/$projectId/sessions"
                      params={{
                        projectId: currentProject.id
                      }}
                    >
                      {({ isActive }) => (
                        <MenuItem variant="project" isSelected={isActive}>
                          <div className="mx-1 flex gap-2">
                            <div className="w-6">
                              <FontAwesomeIcon icon={faDisplay} />
                            </div>
                            Sessions
                          </div>
                        </MenuItem>
                      )}
                    </Link>
                  </MenuGroup>
                  <MenuGroup title="Others">
                    <Link
                      to="/projects/pam/$projectId/access-management"
                      params={{
                        projectId: currentProject.id
                      }}
                    >
                      {({ isActive }) => (
                        <MenuItem variant="project" isSelected={isActive}>
                          <div className="mx-1 flex gap-2">
                            <div className="w-6">
                              <FontAwesomeIcon icon={faUsers} />
                            </div>
                            Project Access
                          </div>
                        </MenuItem>
                      )}
                    </Link>
                    <Link
                      to="/projects/pam/$projectId/audit-logs"
                      params={{
                        projectId: currentProject.id
                      }}
                    >
                      {({ isActive }) => (
                        <MenuItem variant="project" isSelected={isActive}>
                          <div className="mx-1 flex gap-2">
                            <div className="w-6">
                              <FontAwesomeIcon icon={faBook} />
                            </div>
                            Audit Logs
                          </div>
                        </MenuItem>
                      )}
                    </Link>
                    <Link
                      to="/projects/pam/$projectId/settings"
                      params={{
                        projectId: currentProject.id
                      }}
                    >
                      {({ isActive }) => (
                        <MenuItem variant="project" isSelected={isActive}>
                          <div className="mx-1 flex gap-2">
                            <div className="w-6">
                              <FontAwesomeIcon icon={faCog} />
                            </div>
                            Project Settings
                          </div>
                        </MenuItem>
                      )}
                    </Link>
                  </MenuGroup>
                </Menu>
              </div>
              <div>
                <Menu>
                  <Link to="/organization/projects">
                    <MenuItem
                      className="relative flex items-center gap-2 overflow-hidden text-sm text-mineshaft-400 hover:text-mineshaft-300"
                      leftIcon={
                        <div className="w-6">
                          <FontAwesomeIcon className="mx-1 inline-block shrink-0" icon={faHome} />
                        </div>
                      }
                    >
                      Organization Home
                    </MenuItem>
                  </Link>
                </Menu>
              </div>
            </nav>
          </motion.div>
          <div className="flex-1 overflow-x-hidden overflow-y-auto bg-bunker-800 p-4 pt-8">
            {assumedPrivilegeDetails && <AssumePrivilegeModeBanner />}
            <Outlet />
          </div>
        </div>
      </div>
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle("upgradePlan", isOpen);
        }}
        text="You can use PAM if you switch to a paid Infisical plan."
      />
    </>
  );
};
