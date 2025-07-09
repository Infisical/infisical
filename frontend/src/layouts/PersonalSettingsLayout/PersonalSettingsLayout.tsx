import { useTranslation } from "react-i18next";
import { faArrowLeft, faMobile } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, Outlet } from "@tanstack/react-router";

import { WishForm } from "@app/components/features/WishForm";

import { InsecureConnectionBanner } from "../OrganizationLayout/components/InsecureConnectionBanner";

export const PersonalSettingsLayout = () => {
  const { t } = useTranslation();

  return (
    <>
      <div className="dark hidden h-screen w-full flex-col overflow-x-hidden md:flex">
        {!window.isSecureContext && <InsecureConnectionBanner />}
        <div className="flex flex-grow flex-col overflow-y-hidden md:flex-row">
          <aside className="dark w-full border-r border-mineshaft-600 bg-gradient-to-tr from-mineshaft-700 via-mineshaft-800 to-mineshaft-900 md:w-60">
            <nav className="items-between flex h-full flex-col justify-between overflow-y-auto dark:[color-scheme:dark]">
              <div className="flex-grow">
                <Link to="/organization/projects">
                  <div className="my-6 flex cursor-default items-center justify-center pr-2 text-sm text-mineshaft-300 hover:text-mineshaft-100">
                    <FontAwesomeIcon icon={faArrowLeft} className="pr-3" />
                    Back to organization
                  </div>
                </Link>
              </div>
              <div className="relative mt-10 flex w-full cursor-default flex-col items-center px-3 text-sm text-mineshaft-400">
                {(window.location.origin.includes("https://app.infisical.com") ||
                  window.location.origin.includes("https://gamma.infisical.com")) && <WishForm />}
              </div>
              )
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
    </>
  );
};
