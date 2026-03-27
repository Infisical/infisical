import { Outlet } from "@tanstack/react-router";

import { Banner } from "@app/components/page-frames/Banner";
import { SidebarProvider } from "@app/components/v3/generic/Sidebar";
import { useServerConfig, useSubscription } from "@app/context";
import { useFetchServerStatus } from "@app/hooks/api";
import { AuditLogBanner } from "@app/layouts/OrganizationLayout/components/AuditLogBanner";
import { Navbar } from "@app/layouts/OrganizationLayout/components/NavBar";
import { RedisBanner } from "@app/layouts/OrganizationLayout/components/RedisBanner";
import { SmtpBanner } from "@app/layouts/OrganizationLayout/components/SmtpBanner";

import { InsecureConnectionBanner } from "../OrganizationLayout/components/InsecureConnectionBanner";
import { AdminSidebar } from "./AdminSidebar";

export const AdminLayout = () => {
  const { config } = useServerConfig();
  const { data: serverDetails, isLoading } = useFetchServerStatus();
  const { subscription } = useSubscription();

  const containerHeight = config.pageFrameContent ? "h-[94vh]" : "h-screen";

  return (
    <>
      <Banner />
      <div
        className={`dark ${containerHeight} flex w-full flex-col overflow-hidden bg-bunker-800 transition-all`}
      >
        <Navbar />
        {!isLoading && !serverDetails?.redisConfigured && <RedisBanner />}
        {!isLoading && !serverDetails?.emailConfigured && <SmtpBanner />}
        {!isLoading && subscription.auditLogs && <AuditLogBanner />}
        {!window.isSecureContext && <InsecureConnectionBanner />}
        <SidebarProvider>
          <div className="flex min-h-0 flex-1">
            <AdminSidebar />
            <div className="min-h-0 flex-1 overflow-y-auto bg-bunker-800 px-12 pt-10 pb-4 dark:scheme-dark">
              <Outlet />
            </div>
          </div>
        </SidebarProvider>
      </div>
      <Banner />
    </>
  );
};
