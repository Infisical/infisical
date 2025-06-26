import { useTranslation } from "react-i18next";
import { faMobile } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { linkOptions, Outlet, useLocation, useRouterState } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { CreateOrgModal } from "@app/components/organization/CreateOrgModal";
import { Banner } from "@app/components/page-frames/Banner";
import { BreadcrumbContainer, TBreadcrumbFormat } from "@app/components/v2";
import { OrgPermissionSubjects, useOrgPermission, useServerConfig } from "@app/context";
import { OrgPermissionSecretShareAction } from "@app/context/OrgPermissionContext/types";
import { usePopUp } from "@app/hooks";
import { ProjectType } from "@app/hooks/api/workspace/types";

import { InsecureConnectionBanner } from "./components/InsecureConnectionBanner";
import { OrgSidebar } from "./components/OrgSidebar";
import { DefaultSideBar, ProjectOverviewSideBar, SecretSharingSideBar } from "./ProductsSideBar";
import { Navbar } from "./components/NavBar";

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

  const containerHeight = config.pageFrameContent ? "h-[94vh]" : "h-screen";

  return (
    <>
      <Banner />
      <div
        className={`dark hidden ${containerHeight} w-full flex-col overflow-x-hidden bg-bunker-800 transition-all md:flex`}
      >
        <Navbar />
        {!window.isSecureContext && <InsecureConnectionBanner />}
        <div className="flex flex-grow flex-col overflow-y-hidden md:flex-row">
          <OrgSidebar />
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
