import { useTranslation } from "react-i18next";
import { faMobile } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { linkOptions, Outlet, useLocation, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { twMerge } from "tailwind-merge";

import { CreateOrgModal } from "@app/components/organization/CreateOrgModal";
import { Banner } from "@app/components/page-frames/Banner";
import { BreadcrumbContainer, TBreadcrumbFormat } from "@app/components/v2";
import { OrgPermissionSubjects, useOrgPermission, useServerConfig } from "@app/context";
import { OrgPermissionSecretShareAction } from "@app/context/OrgPermissionContext/types";
import { usePopUp } from "@app/hooks";
import { ProjectType } from "@app/hooks/api/workspace/types";

import { InsecureConnectionBanner } from "./components/InsecureConnectionBanner";
import { MinimizedOrgSidebar } from "./components/MinimizedOrgSidebar";
import { SidebarHeader } from "./components/SidebarHeader";
import { DefaultSideBar, ProjectOverviewSideBar, SecretSharingSideBar } from "./ProductsSideBar";

export const OrganizationLayout = () => {
  const matches = useRouterState({ select: (s) => s.matches.at(-1)?.context });
  const location = useLocation();
  const { config } = useServerConfig();
  const { permission } = useOrgPermission();

  const shouldShowProductsSidebar = permission.can(
    OrgPermissionSecretShareAction.ManageSettings,
    OrgPermissionSubjects.SecretShare
  );

  const isOrganizationSpecificPage = location.pathname.startsWith("/organization");
  const breadcrumbs =
    isOrganizationSpecificPage && matches && "breadcrumbs" in matches
      ? matches.breadcrumbs
      : undefined;

  const { popUp, handlePopUpToggle } = usePopUp(["createOrg"] as const);

  const { t } = useTranslation();

  const isSecretSharingPage = (
    [
      linkOptions({ to: "/organization/secret-sharing" }).to,
      linkOptions({ to: "/organization/secret-sharing/settings" }).to
    ] as string[]
  ).includes(location.pathname);

  const isProjectOverviewOrSettingsPage = (
    [
      linkOptions({ to: "/organization/secret-manager/overview" }).to,
      linkOptions({ to: "/organization/secret-manager/settings" }).to,
      linkOptions({ to: "/organization/cert-manager/overview" }).to,
      linkOptions({ to: "/organization/cert-manager/settings" }).to,
      linkOptions({ to: "/organization/kms/overview" }).to,
      linkOptions({ to: "/organization/kms/settings" }).to,
      linkOptions({ to: "/organization/ssh/overview" }).to,
      linkOptions({ to: "/organization/ssh/settings" }).to
    ] as string[]
  ).includes(location.pathname);

  const shouldShowOrgSidebar =
    location.pathname.startsWith("/organization") &&
    (!isSecretSharingPage || shouldShowProductsSidebar) &&
    !([linkOptions({ to: "/organization/secret-scanning" }).to] as string[]).includes(
      location.pathname
    );

  const containerHeight = config.pageFrameContent ? "h-[94vh]" : "h-screen";

  let SideBarComponent = <DefaultSideBar />;

  if (isSecretSharingPage) {
    SideBarComponent = <SecretSharingSideBar />;
  } else if (isProjectOverviewOrSettingsPage) {
    SideBarComponent = (
      <ProjectOverviewSideBar type={location.pathname.split("/")[2] as ProjectType} />
    );
  }

  return (
    <>
      <Banner />
      <div
        className={`dark hidden ${containerHeight} w-full flex-col overflow-x-hidden bg-bunker-800 transition-all md:flex`}
      >
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
                  {!isProjectOverviewOrSettingsPage && (
                    <div className="p-2 pt-3">
                      <SidebarHeader />
                    </div>
                  )}
                  {SideBarComponent}
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
      <Banner />
    </>
  );
};
