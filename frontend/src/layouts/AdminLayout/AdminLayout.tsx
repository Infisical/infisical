import { useTranslation } from "react-i18next";
import { faArrowLeft, faInfo, faMobile, faQuestion } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, Outlet } from "@tanstack/react-router";

import { WishForm } from "@app/components/features/WishForm";
import { Banner } from "@app/components/page-frames/Banner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v2";
import { envConfig } from "@app/config/env";
import { useServerConfig } from "@app/context";
import { ProjectType } from "@app/hooks/api/workspace/types";

import { InsecureConnectionBanner } from "../OrganizationLayout/components/InsecureConnectionBanner";
import { INFISICAL_SUPPORT_OPTIONS } from "../OrganizationLayout/components/MinimizedOrgSidebar/MinimizedOrgSidebar";

export const AdminLayout = () => {
  const { t } = useTranslation();
  const { config } = useServerConfig();

  const containerHeight = config.pageFrameContent ? "h-[94vh]" : "h-screen";

  return (
    <>
      <Banner />
      <div className={`dark hidden ${containerHeight} w-full flex-col overflow-x-hidden md:flex`}>
        {!window.isSecureContext && <InsecureConnectionBanner />}
        <div className="flex flex-grow flex-col overflow-y-hidden md:flex-row">
          <aside className="dark w-full border-r border-mineshaft-600 bg-gradient-to-tr from-mineshaft-700 via-mineshaft-800 to-mineshaft-900 md:w-60">
            <nav className="items-between flex h-full flex-col justify-between overflow-y-auto dark:[color-scheme:dark]">
              <div className="flex-grow">
                <Link to={`/organization/${ProjectType.SecretManager}/overview` as const}>
                  <div className="my-6 flex cursor-default items-center justify-center pr-2 text-sm text-mineshaft-300 hover:text-mineshaft-100">
                    <FontAwesomeIcon icon={faArrowLeft} className="pr-3" />
                    Back to organization
                  </div>
                </Link>
              </div>
              <div className="relative mt-10 flex w-full cursor-default flex-col items-center px-3 text-sm text-mineshaft-400">
                {(window.location.origin.includes("https://app.infisical.com") ||
                  window.location.origin.includes("https://gamma.infisical.com")) && <WishForm />}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <div className="mb-2 w-full pl-5 duration-200 hover:text-mineshaft-200">
                      <FontAwesomeIcon icon={faQuestion} className="mr-3 px-[0.1rem]" />
                      Help & Support
                    </div>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="p-1">
                    {INFISICAL_SUPPORT_OPTIONS.map(([icon, text, url]) => (
                      <DropdownMenuItem key={url as string}>
                        <a
                          target="_blank"
                          rel="noopener noreferrer"
                          href={String(url)}
                          className="flex w-full items-center rounded-md font-normal text-mineshaft-300 duration-200"
                        >
                          <div className="relative flex w-full cursor-pointer select-none items-center justify-start rounded-md">
                            {icon}
                            <div className="text-sm">{text}</div>
                          </div>
                        </a>
                      </DropdownMenuItem>
                    ))}
                    {envConfig.PLATFORM_VERSION && (
                      <div className="mb-2 mt-2 w-full cursor-default pl-5 text-sm duration-200 hover:text-mineshaft-200">
                        <FontAwesomeIcon icon={faInfo} className="mr-4 px-[0.1rem]" />
                        Version: {envConfig.PLATFORM_VERSION}
                      </div>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </nav>
          </aside>
          <main className="flex-1 overflow-y-auto overflow-x-hidden bg-bunker-800 dark:[color-scheme:dark]">
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
