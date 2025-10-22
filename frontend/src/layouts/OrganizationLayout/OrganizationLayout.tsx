import { useTranslation } from "react-i18next";
import { faMobile } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Outlet, useParams } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { CreateOrgModal } from "@app/components/organization/CreateOrgModal";
import { Banner } from "@app/components/page-frames/Banner";
import { useServerConfig, useSubscription } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useFetchServerStatus } from "@app/hooks/api";

import { AuditLogBanner } from "./components/AuditLogBanner";
import { InsecureConnectionBanner } from "./components/InsecureConnectionBanner";
import { Navbar } from "./components/NavBar";
import { OrgNavBar } from "./components/OrgNavBar";
import { RedisBanner } from "./components/RedisBanner";
import { SmtpBanner } from "./components/SmtpBanner";

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

  const { data: serverDetails, isLoading } = useFetchServerStatus();
  const { subscription } = useSubscription();

  return (
    <>
      <Banner />
      <div
        className={`dark hidden ${containerHeight} w-full flex-col overflow-x-hidden bg-bunker-800 transition-all md:flex`}
      >
        <Navbar />
        <div className="flex grow flex-col overflow-y-hidden">
          <OrgNavBar isHidden={isInsideProject} />
          {!isLoading && !isInsideProject && !serverDetails?.redisConfigured && <RedisBanner />}
          {!isLoading && !isInsideProject && !serverDetails?.emailConfigured && <SmtpBanner />}
          {!isLoading && !isInsideProject && subscription.auditLogs && <AuditLogBanner />}
          {!window.isSecureContext && !isInsideProject && <InsecureConnectionBanner />}
          <main
            className={twMerge(
              "flex-1 overflow-x-hidden bg-bunker-800 px-12 pt-10 pb-4 dark:scheme-dark",
              isInsideProject ? "overflow-y-hidden p-0" : "overflow-y-auto"
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
      <div className="z-200 flex h-screen w-screen flex-col items-center justify-center bg-bunker-800 md:hidden">
        <FontAwesomeIcon icon={faMobile} className="mb-8 text-7xl text-gray-300" />
        <p className="max-w-sm px-6 text-center text-lg text-gray-200">
          {` ${t("common.no-mobile")} `}
        </p>
      </div>
      <Banner />
    </>
  );
};
