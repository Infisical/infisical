import { useTranslation } from "react-i18next";
import { faMobile } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Outlet } from "@tanstack/react-router";

import { Banner } from "@app/components/page-frames/Banner";
import { useServerConfig } from "@app/context";

import { NamespaceSidebar } from "./components/NamespaceSidebar";

export const NamespaceLayout = () => {
  const { config } = useServerConfig();

  const { t } = useTranslation();

  const containerHeight = config.pageFrameContent ? "h-[94vh]" : "h-screen";
  return (
    <>
      <Banner />
      <div
        className={`dark hidden ${containerHeight} w-full flex-col overflow-x-hidden bg-bunker-800 transition-all md:flex`}
      >
        <div className="flex flex-grow flex-col overflow-y-hidden md:flex-row">
          <NamespaceSidebar />
          <main className="flex-1 overflow-x-hidden overflow-y-auto bg-bunker-800 px-4 pt-8 pb-4 dark:[color-scheme:dark]">
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
