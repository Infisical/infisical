import { useTranslation } from "react-i18next";
import { faMobile } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, linkOptions, Outlet, useLocation, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { twMerge } from "tailwind-merge";

import { CreateOrgModal } from "@app/components/organization/CreateOrgModal";
import {
  BreadcrumbContainer,
  Menu,
  MenuGroup,
  MenuItem,
  TBreadcrumbFormat
} from "@app/components/v2";
import { usePopUp } from "@app/hooks";

import { InsecureConnectionBanner } from "./components/InsecureConnectionBanner";
import { MinimizedOrgSidebar } from "./components/MinimizedOrgSidebar";
import { SidebarHeader } from "./components/SidebarHeader";

export const OrganizationLayout = () => {
  const matches = useRouterState({ select: (s) => s.matches.at(-1)?.context });
  const location = useLocation();
  const isOrganizationSpecificPage = location.pathname.startsWith("/organization");
  const breadcrumbs =
    isOrganizationSpecificPage && matches && "breadcrumbs" in matches
      ? matches.breadcrumbs
      : undefined;

  const { popUp, handlePopUpToggle } = usePopUp(["createOrg"] as const);

  const { t } = useTranslation();

  const shouldShowOrgSidebar =
    location.pathname.startsWith("/organization") &&
    !(
      [
        linkOptions({ to: "/organization/secret-manager/overview" }).to,
        linkOptions({ to: "/organization/cert-manager/overview" }).to,
        linkOptions({ to: "/organization/ssh/overview" }).to,
        linkOptions({ to: "/organization/kms/overview" }).to,
        linkOptions({ to: "/organization/secret-scanning" }).to,
        linkOptions({ to: "/organization/secret-sharing" }).to
      ] as string[]
    ).includes(location.pathname);

  return (
    <>
      <div className="dark hidden h-screen w-full flex-col overflow-x-hidden bg-bunker-800 transition-all md:flex">
        {!window.isSecureContext && <InsecureConnectionBanner />}
        <div className="flex flex-grow flex-col overflow-y-hidden md:flex-row">
          <MinimizedOrgSidebar />
          <AnimatePresence mode="popLayout">
            {shouldShowOrgSidebar && (
              <motion.div
                key="menu-list-items"
                initial={{ x: -150 }}
                animate={{ x: 0 }}
                exit={{ x: -150 }}
                transition={{ duration: 0.2 }}
                className="dark w-60 overflow-hidden border-r border-mineshaft-600 bg-gradient-to-tr from-mineshaft-700 via-mineshaft-800 to-mineshaft-900"
              >
                <nav className="items-between flex h-full flex-col overflow-y-auto dark:[color-scheme:dark]">
                  <div className="p-2 pt-3">
                    <SidebarHeader />
                  </div>
                  <Menu>
                    <MenuGroup title="Organization Control">
                      <Link to="/organization/audit-logs">
                        {({ isActive }) => (
                          <MenuItem isSelected={isActive} icon="moving-block">
                            Audit Logs
                          </MenuItem>
                        )}
                      </Link>
                      {(window.location.origin.includes("https://app.infisical.com") ||
                        window.location.origin.includes("https://eu.infisical.com") ||
                        window.location.origin.includes("https://gamma.infisical.com")) && (
                        <Link to="/organization/billing">
                          {({ isActive }) => (
                            <MenuItem isSelected={isActive} icon="spinning-coin">
                              Usage & Billing
                            </MenuItem>
                          )}
                        </Link>
                      )}
                    </MenuGroup>
                    <MenuGroup title="Other">
                      <Link to="/organization/access-management">
                        {({ isActive }) => (
                          <MenuItem isSelected={isActive} icon="groups">
                            Access Control
                          </MenuItem>
                        )}
                      </Link>
                      <Link to="/organization/settings">
                        {({ isActive }) => (
                          <MenuItem isSelected={isActive} icon="toggle-settings">
                            Organization Settings
                          </MenuItem>
                        )}
                      </Link>
                    </MenuGroup>
                  </Menu>
                </nav>
              </motion.div>
            )}
          </AnimatePresence>
          <main
            className={twMerge(
              "flex-1 overflow-y-auto overflow-x-hidden bg-bunker-800 px-4 pb-4 dark:[color-scheme:dark]",
              !isOrganizationSpecificPage && "overflow-hidden p-0"
            )}
          >
            {breadcrumbs ? (
              <BreadcrumbContainer breadcrumbs={breadcrumbs as TBreadcrumbFormat[]} />
            ) : null}
            <Outlet />
          </main>
        </div>
      </div>
      <CreateOrgModal
        isOpen={popUp?.createOrg?.isOpen}
        onClose={() => handlePopUpToggle("createOrg", false)}
      />
      <div className="z-[200] flex h-screen w-screen flex-col items-center justify-center bg-bunker-800 md:hidden">
        <FontAwesomeIcon icon={faMobile} className="mb-8 text-7xl text-gray-300" />
        <p className="max-w-sm px-6 text-center text-lg text-gray-200">
          {` ${t("common.no-mobile")} `}
        </p>
      </div>
    </>
  );
};
