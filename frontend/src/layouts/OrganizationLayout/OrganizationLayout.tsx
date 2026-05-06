import { useEffect } from "react";
import { Outlet, useParams } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { CreateOrgModal } from "@app/components/organization/CreateOrgModal";
import { Banner } from "@app/components/page-frames/Banner";
import { SidebarInset, SidebarProvider } from "@app/components/v3";
import { useOrganization, useServerConfig, useSubscription, useUser } from "@app/context";
import { setLastProject } from "@app/helpers/lastProject";
import { usePopUp } from "@app/hooks";
import { useFetchServerStatus } from "@app/hooks/api";

import { AuditLogBanner } from "./components/AuditLogBanner";
import { InsecureConnectionBanner } from "./components/InsecureConnectionBanner";
import { Navbar } from "./components/NavBar";
import { NetworkHealthBanner } from "./components/NetworkHealthBanner";
import { OrgSidebar } from "./components/OrgSidebar";
import { RedisBanner } from "./components/RedisBanner";
import { SmtpBanner } from "./components/SmtpBanner";

export const OrganizationLayout = () => {
  const { config } = useServerConfig();
  const { user } = useUser();
  const { currentOrg } = useOrganization();
  const projectId = useParams({
    strict: false,
    select: (el) => el?.projectId
  });
  const isInsideProject = Boolean(projectId);

  useEffect(() => {
    if (projectId && user?.id && currentOrg?.id) {
      setLastProject(user.id, currentOrg.id, projectId);
    }
  }, [projectId, user?.id, currentOrg?.id]);

  const { popUp, handlePopUpToggle } = usePopUp(["createOrg"] as const);

  const containerHeight = config.pageFrameContent ? "h-[94vh]" : "h-screen";

  const { data: serverDetails, isLoading } = useFetchServerStatus();
  const { subscription } = useSubscription();

  return (
    <>
      <Banner />
      <SidebarProvider
        className={`dark ${containerHeight} flex !min-h-0 w-full flex-col overflow-hidden bg-bunker-800 transition-all`}
      >
        <Navbar />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <OrgSidebar />
          <SidebarInset className="flex flex-col overflow-hidden">
            {!isLoading && !isInsideProject && !serverDetails?.redisConfigured && <RedisBanner />}
            {!isLoading && !isInsideProject && !serverDetails?.emailConfigured && <SmtpBanner />}
            {!isLoading && !isInsideProject && subscription.auditLogs && <AuditLogBanner />}
            {!window.isSecureContext && !isInsideProject && <InsecureConnectionBanner />}
            {!isLoading && !isInsideProject && <NetworkHealthBanner />}
            <div
              className={twMerge(
                "flex-1 overflow-x-hidden bg-bunker-800 dark:scheme-dark",
                isInsideProject ? "overflow-y-hidden" : "overflow-y-auto px-12 pt-10 pb-4"
              )}
            >
              <Outlet />
            </div>
          </SidebarInset>
        </div>
      </SidebarProvider>
      <CreateOrgModal
        isOpen={popUp?.createOrg?.isOpen}
        onClose={() => handlePopUpToggle("createOrg", false)}
      />
      <Banner />
    </>
  );
};
