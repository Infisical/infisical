import { useTranslation } from "react-i18next";
import { faMobile } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Outlet, useRouterState } from "@tanstack/react-router";

import { Banner } from "@app/components/page-frames/Banner";
import { BreadcrumbContainer, TBreadcrumbFormat } from "@app/components/v2";
import { useServerConfig } from "@app/context";

import { InsecureConnectionBanner } from "../OrganizationLayout/components/InsecureConnectionBanner";
import { AdminSidebar } from "./Sidebar";

export const AdminLayout = () => {
  const { t } = useTranslation();
  const { config } = useServerConfig();

  const matches = useRouterState({ select: (s) => s.matches.at(-1)?.context });

  const breadcrumbs = matches && "breadcrumbs" in matches ? matches.breadcrumbs : undefined;

  const containerHeight = config.pageFrameContent ? "h-[94vh]" : "h-screen";

  return (
    <>
      <Banner />
      <div className={`dark hidden ${containerHeight} w-full flex-col overflow-x-hidden md:flex`}>
        {!window.isSecureContext && <InsecureConnectionBanner />}
        <div className="flex flex-grow flex-col overflow-y-hidden md:flex-row">
          <AdminSidebar />
          <main className="flex-1 overflow-y-auto overflow-x-hidden bg-bunker-800 px-4 pb-4 dark:[color-scheme:dark]">
            {breadcrumbs ? (
              <BreadcrumbContainer breadcrumbs={breadcrumbs as TBreadcrumbFormat[]} />
            ) : null}
            <Outlet />
          </main>
        </div>
      </div>
      <div className="z-[200] flex h-screen w-screen flex-col items-center justify-center bg-bunker-800 md:hidden">
        <FontAwesomeIcon icon={faMobile} className="mb-8 text-7xl text-gray-300" />
        <p className="max-w-sm px-6 text-center text-lg text-gray-200">
          {` ${t("common.no-mobile")} `}
        </p>
      </div>
      <Banner />
    </>
  );
};
