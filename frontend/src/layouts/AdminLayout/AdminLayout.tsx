import { useTranslation } from "react-i18next";
import { faMobile } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Outlet } from "@tanstack/react-router";

import { Banner } from "@app/components/page-frames/Banner";
import { useServerConfig, useSubscription } from "@app/context";
import { useFetchServerStatus } from "@app/hooks/api";
import { AuditLogBanner } from "@app/layouts/OrganizationLayout/components/AuditLogBanner";
import { Navbar } from "@app/layouts/OrganizationLayout/components/NavBar";
import { RedisBanner } from "@app/layouts/OrganizationLayout/components/RedisBanner";
import { SmtpBanner } from "@app/layouts/OrganizationLayout/components/SmtpBanner";

import { InsecureConnectionBanner } from "../OrganizationLayout/components/InsecureConnectionBanner";
import { AdminSidebar } from "./Sidebar";

export const AdminLayout = () => {
  const { t } = useTranslation();
  const { config } = useServerConfig();
  const { data: serverDetails, isLoading } = useFetchServerStatus();
  const { subscription } = useSubscription();

  const containerHeight = config.pageFrameContent ? "h-[94vh]" : "h-screen";

  return (
    <>
      <Banner />
      <div
        className={`dark hidden ${containerHeight} bg-bunker-800 w-full flex-col overflow-x-hidden transition-all md:flex`}
      >
        <Navbar />
        {!isLoading && !serverDetails?.redisConfigured && <RedisBanner />}
        {!isLoading && !serverDetails?.emailConfigured && <SmtpBanner />}
        {!isLoading && subscription.auditLogs && <AuditLogBanner />}
        {!window.isSecureContext && <InsecureConnectionBanner />}
        <div className="flex grow flex-col overflow-y-hidden md:flex-row">
          <AdminSidebar />
          <div className="bg-bunker-800 dark:scheme-dark flex-1 overflow-y-auto overflow-x-hidden px-4 pb-4 pt-8">
            <Outlet />
          </div>
        </div>
      </div>
      <div className="z-200 bg-bunker-800 flex h-screen w-screen flex-col items-center justify-center md:hidden">
        <FontAwesomeIcon icon={faMobile} className="mb-8 text-7xl text-gray-300" />
        <p className="max-w-sm px-6 text-center text-lg text-gray-200">
          {` ${t("common.no-mobile")} `}
        </p>
      </div>
      <Banner />
    </>
  );
};
