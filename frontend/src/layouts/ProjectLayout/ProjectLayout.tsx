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

  const { t } = useTranslation();
  const { assumedPrivilegeDetails } = useProjectPermission();

  const currentProductType = getCurrentProductFromUrl(location.pathname);

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
