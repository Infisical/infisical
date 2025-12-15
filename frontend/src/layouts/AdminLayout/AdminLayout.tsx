import { Outlet } from "@tanstack/react-router";

import { Banner } from "@app/components/page-frames/Banner";
import { useServerConfig, useSubscription } from "@app/context";
import { useFetchServerStatus } from "@app/hooks/api";
import { SubscriptionProductCategory } from "@app/hooks/api/subscriptions/types";
import { AuditLogBanner } from "@app/layouts/OrganizationLayout/components/AuditLogBanner";
import { Navbar } from "@app/layouts/OrganizationLayout/components/NavBar";
import { RedisBanner } from "@app/layouts/OrganizationLayout/components/RedisBanner";
import { SmtpBanner } from "@app/layouts/OrganizationLayout/components/SmtpBanner";

import { InsecureConnectionBanner } from "../OrganizationLayout/components/InsecureConnectionBanner";
import { AdminNavBar } from "./AdminNavBar";

export const AdminLayout = () => {
  const { config } = useServerConfig();
  const { data: serverDetails, isLoading } = useFetchServerStatus();
  const { subscription } = useSubscription();

  const containerHeight = config.pageFrameContent ? "h-[94vh]" : "h-screen";

  return (
    <>
      <Banner />
      <div
        className={`dark ${containerHeight} flex w-full flex-col overflow-x-hidden bg-bunker-800 transition-all`}
      >
        <Navbar />
        {!isLoading && !serverDetails?.redisConfigured && <RedisBanner />}
        {!isLoading && !serverDetails?.emailConfigured && <SmtpBanner />}
        {!isLoading && subscription.get(SubscriptionProductCategory.Platform, "auditLogs") && (
          <AuditLogBanner />
        )}
        {!window.isSecureContext && <InsecureConnectionBanner />}
        <div className="flex grow flex-col overflow-y-hidden">
          <AdminNavBar />
          <div className="flex-1 overflow-x-hidden overflow-y-auto bg-bunker-800 px-12 pt-10 pb-4 dark:scheme-dark">
            <Outlet />
          </div>
        </div>
      </div>
      <Banner />
    </>
  );
};
