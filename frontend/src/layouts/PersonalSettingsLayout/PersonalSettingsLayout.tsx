import { Outlet } from "@tanstack/react-router";

import { InsecureConnectionBanner } from "../OrganizationLayout/components/InsecureConnectionBanner";

export const PersonalSettingsLayout = () => {
  return (
    <div className="dark flex h-screen w-full flex-col overflow-hidden bg-background">
      {!window.isSecureContext && <InsecureConnectionBanner />}
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto dark:scheme-dark">
        <Outlet />
      </main>
    </div>
  );
};
