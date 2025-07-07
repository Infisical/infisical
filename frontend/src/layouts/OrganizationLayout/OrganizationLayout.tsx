import { useTranslation } from "react-i18next";
import { faMobile } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Outlet, useParams } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { CreateOrgModal } from "@app/components/organization/CreateOrgModal";
import { Banner } from "@app/components/page-frames/Banner";
import { useServerConfig } from "@app/context";
import { usePopUp } from "@app/hooks";

import { InsecureConnectionBanner } from "./components/InsecureConnectionBanner";
import { Navbar } from "./components/NavBar";
import { OrgSidebar } from "./components/OrgSidebar";

export const OrganizationLayout = () => {
  const { config } = useServerConfig();
  const projectId = useParams({
    strict: false,
    select: (el) => el?.projectId
  });
  const isInsideProject = Boolean(projectId);

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
          <OrgSidebar isHidden={isInsideProject} />
          <main
            className={twMerge(
              "flex-1 overflow-y-auto overflow-x-hidden bg-bunker-800 px-4 pb-4 pt-8 dark:[color-scheme:dark]",
              isInsideProject && "p-0"
            )}
          >
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
