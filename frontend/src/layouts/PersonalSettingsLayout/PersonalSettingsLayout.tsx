import { Outlet } from "@tanstack/react-router";

import { InsecureConnectionBanner } from "../OrganizationLayout/components/InsecureConnectionBanner";

export const PersonalSettingsLayout = () => {
  return (
    <div className="dark flex h-screen w-full flex-col overflow-x-hidden bg-bunker-800">
      {!window.isSecureContext && <InsecureConnectionBanner />}
      <div className="flex grow flex-col overflow-y-hidden md:flex-row">
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-bunker-800 px-6 py-10 md:px-12 dark:scheme-dark">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
