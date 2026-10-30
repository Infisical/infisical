import { useEffect } from "react";
import { Outlet, useParams, useRouterState } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import {
  clearSignupTrialIntent,
  getSignupTrialBillingSearch,
  getSignupTrialIntent
} from "@app/components/auth/signupTrialIntent";
import { CreateOrgModal } from "@app/components/organization/CreateOrgModal";
import { Banner } from "@app/components/page-frames/Banner";
import { PageBannerStack } from "@app/components/page-frames/PageBannerStack";
import { SidebarInset, SidebarProvider } from "@app/components/v3";
import { useOrganization, useServerConfig, useSubscription } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useFetchServerStatus } from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/projects/types";
import { useImplicitProduct } from "@app/hooks/useImplicitProduct";
import { CertManagerInstanceBanner } from "@app/layouts/PkiManagerLayout/components/CertManagerInstanceBanner";
import { AssumePrivilegeModeBanner } from "@app/layouts/ProjectLayout/components/AssumePrivilegeModeBanner";

import { AuditLogBanner } from "./components/AuditLogBanner";
import { InsecureConnectionBanner } from "./components/InsecureConnectionBanner";
import { Navbar } from "./components/NavBar";
import { NetworkHealthBanner } from "./components/NetworkHealthBanner";
import { OrgSidebar } from "./components/OrgSidebar";
import { RedisBanner } from "./components/RedisBanner";
import { SmtpBanner } from "./components/SmtpBanner";
import { TrialPaymentFailedBanner } from "./components/TrialPaymentFailedBanner";

export const OrganizationLayout = () => {
  const { config } = useServerConfig();
  const projectId = useParams({
    strict: false,
    select: (el) => el?.projectId
  });
  const implicitProduct = useImplicitProduct();
  // Certificate Manager and Secret Scanning bring their own scroll container, so they keep the project
  // page chrome.
  const isInsideProject =
    Boolean(projectId) ||
    implicitProduct === ProjectType.CertificateManager ||
    implicitProduct === ProjectType.SecretScanning;
  const isCertManagerOverview = useRouterState({
    select: (state) =>
      state.matches.some(
        (match) =>
          match.routeId ===
          "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/cert-manager/_cert-manager-layout/overview"
      )
  });

  const { popUp, handlePopUpToggle } = usePopUp(["createOrg"] as const);

  const containerHeight = config.pageFrameContent ? "h-[94vh]" : "h-screen";

  const { data: serverDetails, isLoading } = useFetchServerStatus();
  const { subscription } = useSubscription();
  const { currentOrg } = useOrganization();
  const billingOrgId = currentOrg.rootOrgId ?? currentOrg.id;

  useEffect(() => {
    const trialIntent = getSignupTrialIntent();
    if (!trialIntent?.orgId) return;
    clearSignupTrialIntent();
    if (trialIntent.orgId !== billingOrgId) return;
    const search = new URLSearchParams(
      getSignupTrialBillingSearch(
        trialIntent,
        `${window.location.pathname}${window.location.search}${window.location.hash}`
      )
    );
    window.location.assign(`/organizations/${billingOrgId}/billing?${search.toString()}`);
  }, [billingOrgId]);

  return (
    <>
      <Banner />
      <SidebarProvider
        className={`dark ${containerHeight} flex !min-h-0 w-full flex-col overflow-hidden bg-page transition-all`}
      >
        <PageBannerStack>
          <TrialPaymentFailedBanner />
          {(isInsideProject || implicitProduct) && <AssumePrivilegeModeBanner />}
          {isCertManagerOverview && <CertManagerInstanceBanner />}
          {!isLoading && !isInsideProject && !serverDetails?.redisConfigured && <RedisBanner />}
          {!isLoading && !isInsideProject && !serverDetails?.emailConfigured && <SmtpBanner />}
          {!isLoading && !isInsideProject && subscription.auditLogs && <AuditLogBanner />}
          {!window.isSecureContext && !isInsideProject && <InsecureConnectionBanner />}
          {!isLoading && !isInsideProject && <NetworkHealthBanner />}
        </PageBannerStack>
        <Navbar />
        <div className="flex min-h-0 flex-1 overflow-hidden">
          <OrgSidebar />
          <SidebarInset className="flex flex-col overflow-hidden">
            <div
              className={twMerge(
                "flex-1 overflow-x-hidden",
                isInsideProject ? "overflow-y-hidden" : "overflow-y-auto px-6 py-10 md:px-12"
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
