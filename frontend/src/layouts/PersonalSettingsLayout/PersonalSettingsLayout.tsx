import { Outlet } from "@tanstack/react-router";

import { PageBannerStack } from "@app/components/page-frames/PageBannerStack";

import { InsecureConnectionBanner } from "../OrganizationLayout/components/InsecureConnectionBanner";

export const PersonalSettingsLayout = () => {
  return (
    <div className="dark flex h-screen w-full flex-col overflow-hidden bg-page">
      <PageBannerStack>{!window.isSecureContext && <InsecureConnectionBanner />}</PageBannerStack>
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
};
