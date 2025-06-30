import { useTranslation } from "react-i18next";
import { faDotCircle, faMobile, faWindowMaximize } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { twMerge } from "tailwind-merge";

import { ShouldWrap } from "@app/components/utilities/ShouldWrapComponent";
import {
  Divider,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Lottie,
  Menu,
  MenuItem,
  Tooltip
} from "@app/components/v2";
import { useProjectPermission, useWorkspace } from "@app/context";
import { getCurrentProductFromUrl } from "@app/helpers/project";
import { useLocalStorageState } from "@app/hooks";
import { ProjectType } from "@app/hooks/api/workspace/types";

import { AssumePrivilegeModeBanner } from "./components/AssumePrivilegeModeBanner";

enum SidebarStyle {
  Expanded = "expanded",
  Collapsed = "collapsed",
  ExpandOnHover = "expand-on-hover"
}
const MIN_SIDEBAR_SIZE = "55px";
const MAX_SIDEBAR_SIZE = "220px";
// This is a generic layout shared by all types of projects.
// If the product layout differs significantly, create a new layout as needed.
export const ProjectLayout = () => {
  const location = useLocation();
  const { currentWorkspace } = useWorkspace();
  const [sidebarStyle, setSidebarStyle] = useLocalStorageState(
    "project-sidebar-style",
    SidebarStyle.ExpandOnHover
  );

  const { t } = useTranslation();
  const { assumedPrivilegeDetails } = useProjectPermission();

  const minSidebarWidth =
    sidebarStyle === SidebarStyle.Expanded ? MAX_SIDEBAR_SIZE : MIN_SIDEBAR_SIZE;
  const maxSidebarWidth =
    sidebarStyle === SidebarStyle.Collapsed ? MIN_SIDEBAR_SIZE : MAX_SIDEBAR_SIZE;

  const currentProductType = getCurrentProductFromUrl(location.pathname);
  const isSecretManager = currentProductType === ProjectType.SecretManager;
  const isPki = currentProductType === ProjectType.CertificateManager;
  const isKms = currentProductType === ProjectType.KMS;
  const isSsh = currentProductType === ProjectType.SSH;
  const isSecretScanning = currentProductType === ProjectType.SecretScanning;

  return (
    <>
      <div
        className="dark relative hidden w-full flex-col overflow-x-hidden md:flex"
        style={{
          height: "calc(100vh - 3rem)",
          paddingLeft: !(sidebarStyle === SidebarStyle.Expanded) ? MIN_SIDEBAR_SIZE : "0px"
        }}
      >
        <div className="flex flex-grow flex-col overflow-y-auto overflow-x-hidden md:flex-row">
          <motion.div
            key="menu-project-items"
            initial={{ x: -150 }}
            animate={{ x: 0 }}
            exit={{ x: -150 }}
            transition={{ duration: 0.2 }}
            style={{ width: minSidebarWidth, height: "calc(100vh - 3rem)" }}
            whileHover={{
              width: maxSidebarWidth
            }}
            className={twMerge(
              "dark group z-10 w-full overflow-hidden border-r border-mineshaft-600 bg-gradient-to-tr from-mineshaft-700 via-mineshaft-800 to-mineshaft-900 md:w-60",
              !(sidebarStyle === SidebarStyle.Expanded) && "absolute bottom-0 left-0"
            )}
          >
            <nav className="items-between flex h-full flex-col justify-between">
              <Menu>
                <ShouldWrap
                  wrapper={Tooltip}
                  isWrapped={sidebarStyle === SidebarStyle.Collapsed}
                  content="Secret Manager"
                  position="right"
                >
                  <Link
                    to="/projects/$projectId/secret-manager/overview"
                    params={{ projectId: currentWorkspace.id }}
                  >
                    <MenuItem
                      className="relative flex items-center gap-2 overflow-hidden rounded-none"
                      isSelected={isSecretManager}
                      leftIcon={<Lottie className="inline-block h-6 w-6 shrink-0" icon="vault" />}
                    >
                      {isSecretManager && (
                        <div className="absolute left-0 top-0 h-full w-0.5 bg-primary" />
                      )}
                      Secret Manager
                    </MenuItem>
                  </Link>
                </ShouldWrap>
                <ShouldWrap
                  wrapper={Tooltip}
                  isWrapped={sidebarStyle === SidebarStyle.Collapsed}
                  content="PKI Manager"
                  position="right"
                >
                  <Link
                    to="/projects/$projectId/cert-manager/subscribers"
                    params={{ projectId: currentWorkspace.id }}
                  >
                    <MenuItem
                      className="relative flex items-center gap-2 overflow-hidden rounded-none"
                      isSelected={isPki}
                      leftIcon={<Lottie className="inline-block h-6 w-6 shrink-0" icon="note" />}
                    >
                      {isPki && <div className="absolute left-0 top-0 h-full w-0.5 bg-primary" />}
                      PKI Manager
                    </MenuItem>
                  </Link>
                </ShouldWrap>
                <ShouldWrap
                  wrapper={Tooltip}
                  isWrapped={sidebarStyle === SidebarStyle.Collapsed}
                  content="KMS"
                  position="right"
                >
                  <Link
                    to="/projects/$projectId/kms/overview"
                    params={{ projectId: currentWorkspace.id }}
                  >
                    <MenuItem
                      className="relative flex items-center gap-2 overflow-hidden rounded-none"
                      isSelected={isKms}
                      leftIcon={<Lottie className="inline-block h-6 w-6 shrink-0" icon="unlock" />}
                    >
                      {isKms && <div className="absolute left-0 top-0 h-full w-0.5 bg-primary" />}
                      KMS
                    </MenuItem>
                  </Link>
                </ShouldWrap>
                <ShouldWrap
                  wrapper={Tooltip}
                  isWrapped={sidebarStyle === SidebarStyle.Collapsed}
                  content="SSH"
                  position="right"
                >
                  <Link
                    to="/projects/$projectId/ssh/overview"
                    params={{ projectId: currentWorkspace.id }}
                  >
                    <MenuItem
                      className="relative flex items-center gap-2 overflow-hidden rounded-none"
                      isSelected={isSsh}
                      leftIcon={
                        <Lottie className="inline-block h-6 w-6 shrink-0" icon="terminal" />
                      }
                    >
                      {isSsh && <div className="absolute left-0 top-0 h-full w-0.5 bg-primary" />}
                      SSH
                    </MenuItem>
                  </Link>
                </ShouldWrap>
                <ShouldWrap
                  wrapper={Tooltip}
                  isWrapped={sidebarStyle === SidebarStyle.Collapsed}
                  content="Secret Scanning"
                  position="right"
                >
                  <Link
                    to="/projects/$projectId/secret-scanning/data-sources"
                    params={{ projectId: currentWorkspace.id }}
                  >
                    <MenuItem
                      className="relative flex items-center gap-2 overflow-hidden rounded-none"
                      isSelected={isSecretScanning}
                      leftIcon={
                        <Lottie className="inline-block h-6 w-6 shrink-0" icon="secret-scan" />
                      }
                    >
                      {isSecretScanning && (
                        <div className="absolute left-0 top-0 h-full w-0.5 bg-primary" />
                      )}
                      Secret Scanning
                    </MenuItem>
                  </Link>
                </ShouldWrap>
              </Menu>
              <Divider />
              <Menu>
                <ShouldWrap
                  wrapper={Tooltip}
                  isWrapped={sidebarStyle === SidebarStyle.Collapsed}
                  content="Access Control"
                  position="right"
                >
                  <Link
                    to="/projects/$projectId/access-management"
                    params={{ projectId: currentWorkspace.id }}
                  >
                    {({ isActive }) => (
                      <MenuItem
                        className="relative flex items-center gap-2 overflow-hidden rounded-none"
                        isSelected={isActive}
                        leftIcon={
                          <Lottie className="inline-block h-6 w-6 shrink-0" icon="groups" />
                        }
                      >
                        {isActive && (
                          <div className="absolute left-0 top-0 h-full w-0.5 bg-primary" />
                        )}
                        Access Control
                      </MenuItem>
                    )}
                  </Link>
                </ShouldWrap>
                <ShouldWrap
                  wrapper={Tooltip}
                  isWrapped={sidebarStyle === SidebarStyle.Collapsed}
                  content="Project Settings"
                  position="right"
                >
                  <Link
                    to="/projects/$projectId/settings"
                    params={{ projectId: currentWorkspace.id }}
                  >
                    {({ isActive }) => (
                      <MenuItem
                        className="relative flex items-center gap-2 overflow-hidden rounded-none"
                        isSelected={isActive}
                        leftIcon={
                          <Lottie className="inline-block h-6 w-6 shrink-0" icon="settings-cog" />
                        }
                      >
                        {isActive && (
                          <div className="absolute left-0 top-0 h-full w-0.5 bg-primary" />
                        )}
                        Project Settings
                      </MenuItem>
                    )}
                  </Link>
                </ShouldWrap>
              </Menu>
              <div className="flex-grow" />
              <Menu>
                <DropdownMenu>
                  <ShouldWrap
                    wrapper={Tooltip}
                    isWrapped={sidebarStyle === SidebarStyle.Collapsed}
                    content="Sidebar Control"
                    position="right"
                  >
                    <DropdownMenuTrigger className="w-full">
                      <MenuItem
                        className="relative flex items-center gap-2 overflow-hidden text-sm text-mineshaft-400 hover:text-mineshaft-300"
                        leftIcon={
                          <FontAwesomeIcon
                            className="mx-1 inline-block shrink-0"
                            icon={faWindowMaximize}
                            flip="vertical"
                          />
                        }
                      >
                        Sidebar Control
                      </MenuItem>
                    </DropdownMenuTrigger>
                  </ShouldWrap>
                  <DropdownMenuContent>
                    <DropdownMenuItem
                      iconPos="right"
                      icon={
                        sidebarStyle === SidebarStyle.Expanded && (
                          <FontAwesomeIcon icon={faDotCircle} size="sm" />
                        )
                      }
                      onClick={() => setSidebarStyle(SidebarStyle.Expanded)}
                    >
                      Expanded
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      iconPos="right"
                      icon={
                        sidebarStyle === SidebarStyle.Collapsed && (
                          <FontAwesomeIcon icon={faDotCircle} size="sm" />
                        )
                      }
                      onClick={() => setSidebarStyle(SidebarStyle.Collapsed)}
                    >
                      Collapsed
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      iconPos="right"
                      icon={
                        sidebarStyle === SidebarStyle.ExpandOnHover && (
                          <FontAwesomeIcon icon={faDotCircle} size="sm" />
                        )
                      }
                      onClick={() => setSidebarStyle(SidebarStyle.ExpandOnHover)}
                    >
                      Expand on hover
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </Menu>
            </nav>
          </motion.div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden bg-bunker-800">
            {assumedPrivilegeDetails && <AssumePrivilegeModeBanner />}
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
