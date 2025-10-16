import { useTranslation } from "react-i18next";
import {
  faBell,
  faBook,
  faCertificate,
  faCog,
  faFileLines,
  faHome,
  faMobile,
  faPlug,
  faPuzzlePiece,
  faSitemap,
  faStamp,
  faUsers
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, Outlet } from "@tanstack/react-router";
import { motion } from "framer-motion";

import { Lottie, Menu, MenuGroup, MenuItem } from "@app/components/v2";
import { useProject, useProjectPermission, useSubscription } from "@app/context";
import {
  useListWorkspaceCertificateTemplates,
  useListWorkspacePkiSubscribers
} from "@app/hooks/api";

import { AssumePrivilegeModeBanner } from "../ProjectLayout/components/AssumePrivilegeModeBanner";

export const PkiManagerLayout = () => {
  const { currentProject } = useProject();
  const { assumedPrivilegeDetails } = useProjectPermission();
  const { subscription } = useSubscription();
  const { t } = useTranslation();

  const { data: subscribers = [] } = useListWorkspacePkiSubscribers(currentProject?.id || "");
  const { data: templatesData } = useListWorkspaceCertificateTemplates({
    projectId: currentProject?.id || ""
  });
  const templates = templatesData?.certificateTemplates || [];

  const hasExistingSubscribers = subscribers.length > 0;
  const hasExistingTemplates = templates.length > 0;
  const showLegacySection =
    subscription.pkiLegacyTemplates || hasExistingSubscribers || hasExistingTemplates;

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
                <Lottie className="inline-block h-5 w-5 shrink-0" icon="note" />
                PKI Manager
              </div>
              <div className="flex-1">
                <Menu>
                  <MenuGroup title="Resources">
                    <Link
                      to="/projects/cert-management/$projectId/policies"
                      params={{
                        projectId: currentProject.id
                      }}
                    >
                      {({ isActive }) => (
                        <MenuItem variant="project" isSelected={isActive}>
                          <div className="mx-1 flex gap-2">
                            <div className="w-6">
                              <FontAwesomeIcon icon={faFileLines} />
                            </div>
                            Certificate Policies
                          </div>
                        </MenuItem>
                      )}
                    </Link>
                    <Link
                      to="/projects/cert-management/$projectId/certificates"
                      params={{
                        projectId: currentProject.id
                      }}
                    >
                      {({ isActive }) => (
                        <MenuItem variant="project" isSelected={isActive}>
                          <div className="mx-1 flex gap-2">
                            <div className="w-6">
                              <FontAwesomeIcon icon={faCertificate} />
                            </div>
                            Certificates
                          </div>
                        </MenuItem>
                      )}
                    </Link>
                    <Link
                      to="/projects/cert-management/$projectId/certificate-authorities"
                      params={{
                        projectId: currentProject.id
                      }}
                    >
                      {({ isActive }) => (
                        <MenuItem variant="project" isSelected={isActive}>
                          <div className="mx-1 flex gap-2">
                            <div className="w-6">
                              <FontAwesomeIcon icon={faStamp} />
                            </div>
                            Certificates Authorities
                          </div>
                        </MenuItem>
                      )}
                    </Link>
                    <Link
                      to="/projects/cert-management/$projectId/alerting"
                      params={{
                        projectId: currentProject.id
                      }}
                    >
                      {({ isActive }) => (
                        <MenuItem variant="project" isSelected={isActive}>
                          <div className="mx-1 flex gap-2">
                            <div className="w-6">
                              <FontAwesomeIcon icon={faBell} />
                            </div>
                            Alerting
                          </div>
                        </MenuItem>
                      )}
                    </Link>
                    <Link
                      to="/projects/cert-management/$projectId/integrations"
                      params={{
                        projectId: currentProject.id
                      }}
                    >
                      {({ isActive }) => (
                        <MenuItem variant="project" isSelected={isActive}>
                          <div className="mx-1 flex gap-2">
                            <div className="w-6">
                              <FontAwesomeIcon icon={faPuzzlePiece} />
                            </div>
                            Integrations
                          </div>
                        </MenuItem>
                      )}
                    </Link>
                    <Link
                      to="/projects/cert-management/$projectId/app-connections"
                      params={{
                        projectId: currentProject.id
                      }}
                    >
                      {({ isActive }) => (
                        <MenuItem variant="project" isSelected={isActive}>
                          <div className="mx-1 flex gap-2">
                            <div className="w-6">
                              <FontAwesomeIcon icon={faPlug} />
                            </div>
                            App Connections
                          </div>
                        </MenuItem>
                      )}
                    </Link>
                  </MenuGroup>
                  {showLegacySection && (
                    <MenuGroup title="Legacy">
                      {(subscription.pkiLegacyTemplates || hasExistingSubscribers) && (
                        <Link
                          to="/projects/cert-management/$projectId/subscribers"
                          params={{
                            projectId: currentProject.id
                          }}
                        >
                          {({ isActive }) => (
                            <MenuItem isSelected={isActive}>
                              <div className="mx-1 flex gap-2">
                                <div className="w-6">
                                  <FontAwesomeIcon icon={faSitemap} />
                                </div>
                                Subscribers
                              </div>
                            </MenuItem>
                          )}
                        </Link>
                      )}
                      {(subscription.pkiLegacyTemplates || hasExistingTemplates) && (
                        <Link
                          to="/projects/cert-management/$projectId/certificate-templates"
                          params={{
                            projectId: currentProject.id
                          }}
                        >
                          {({ isActive }) => (
                            <MenuItem isSelected={isActive}>
                              <div className="mx-1 flex gap-2">
                                <div className="w-6">
                                  <FontAwesomeIcon icon={faFileLines} />
                                </div>
                                Certificate Templates
                              </div>
                            </MenuItem>
                          )}
                        </Link>
                      )}
                    </MenuGroup>
                  )}
                  <MenuGroup title="Others">
                    <Link
                      to="/projects/cert-management/$projectId/access-management"
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
                      to="/projects/cert-management/$projectId/audit-logs"
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
                      to="/projects/cert-management/$projectId/settings"
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
      <div className="z-200 flex h-screen w-screen flex-col items-center justify-center bg-bunker-800 md:hidden">
        <FontAwesomeIcon icon={faMobile} className="mb-8 text-7xl text-gray-300" />
        <p className="max-w-sm px-6 text-center text-lg text-gray-200">
          {` ${t("common.no-mobile")} `}
        </p>
      </div>
    </>
  );
};
