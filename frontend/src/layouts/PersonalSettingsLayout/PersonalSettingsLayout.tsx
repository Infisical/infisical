import { Outlet } from "@tanstack/react-router";

import { InsecureConnectionBanner } from "../OrganizationLayout/components/InsecureConnectionBanner";

export const PersonalSettingsLayout = () => {
  return (
    <div className="dark flex min-h-screen w-full flex-col bg-background">
      {!window.isSecureContext && <InsecureConnectionBanner />}
      <main className="min-w-0 flex-1 dark:scheme-dark">
        <Outlet />
      </main>
    </div>
  );
};
