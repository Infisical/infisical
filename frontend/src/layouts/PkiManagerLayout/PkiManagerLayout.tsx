import { useTranslation } from "react-i18next";
import { faMobile } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, Outlet } from "@tanstack/react-router";
import { motion } from "framer-motion";

import { Menu, MenuItem } from "@app/components/v2";
import { useWorkspace } from "@app/context";

export const PkiManagerLayout = () => {
  const { currentWorkspace } = useWorkspace();
  const { t } = useTranslation();

  return (
    <>
      <div className="dark hidden h-full w-full flex-col overflow-x-hidden md:flex">
        <div className="flex flex-grow flex-col overflow-y-hidden md:flex-row">
          <motion.div
            key="menu-project-items"
            initial={{ x: -150 }}
            animate={{ x: 0 }}
            exit={{ x: -150 }}
            transition={{ duration: 0.2 }}
            className="dark w-full border-r border-mineshaft-600 bg-gradient-to-tr from-mineshaft-700 via-mineshaft-800 to-mineshaft-900 md:w-60"
          >
            <nav className="items-between flex h-full flex-col overflow-y-auto dark:[color-scheme:dark]">
              <div className="border-b border-mineshaft-600 px-4 py-3.5 text-lg text-white">
                PKI Manager
              </div>
              <div className="flex-1">
                <Menu>
                  <Link
                    to="/projects/$projectId/cert-manager/subscribers"
                    params={{
                      projectId: currentWorkspace.id
                    }}
                  >
                    {({ isActive }) => <MenuItem isSelected={isActive}>Subscribers</MenuItem>}
                  </Link>
                  <Link
                    to="/projects/$projectId/cert-manager/certificate-templates"
                    params={{
                      projectId: currentWorkspace.id
                    }}
                  >
                    {({ isActive }) => (
                      <MenuItem isSelected={isActive}> Certificate Templates</MenuItem>
                    )}
                  </Link>
                  <Link
                    to="/projects/$projectId/cert-manager/certificates"
                    params={{
                      projectId: currentWorkspace.id
                    }}
                  >
                    {({ isActive }) => <MenuItem isSelected={isActive}> Certificates</MenuItem>}
                  </Link>
                  <Link
                    to="/projects/$projectId/cert-manager/certificate-authorities"
                    params={{
                      projectId: currentWorkspace.id
                    }}
                  >
                    {({ isActive }) => (
                      <MenuItem isSelected={isActive}> Certificates Authorities</MenuItem>
                    )}
                  </Link>
                  <Link
                    to="/projects/$projectId/cert-manager/alerting"
                    params={{
                      projectId: currentWorkspace.id
                    }}
                  >
                    {({ isActive }) => <MenuItem isSelected={isActive}>Alerting</MenuItem>}
                  </Link>
                  {
                    // <Link
                    //   to="/projects/$projectId/cert-manager/settings"
                    //   params={{
                    //     projectId: currentWorkspace.id
                    //   }}
                    // >
                    //   {({ isActive }) => <MenuItem isSelected={isActive}>Settings</MenuItem>}
                    // </Link>
                  }
                </Menu>
              </div>
            </nav>
          </motion.div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden bg-bunker-800 p-4 pt-8">
            <Outlet />
          </div>
        </div>
      </div>
      <div className="z-[200] flex h-screen w-screen flex-col items-center justify-center bg-bunker-800 md:hidden">
        <FontAwesomeIcon icon={faMobile} className="mb-8 text-7xl text-gray-300" />
        <p className="max-w-sm px-6 text-center text-lg text-gray-200">
          {` ${t("common.no-mobile")} `}
        </p>
      </div>
    </>
  );
};
