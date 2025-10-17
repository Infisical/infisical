import { useTranslation } from "react-i18next";
import { faArrowLeft, faMobile } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, Outlet } from "@tanstack/react-router";

import { WishForm } from "@app/components/features/WishForm";
import { Navbar } from "@app/layouts/OrganizationLayout/components/NavBar";

import { InsecureConnectionBanner } from "../OrganizationLayout/components/InsecureConnectionBanner";

export const PersonalSettingsLayout = () => {
  const { t } = useTranslation();

  return (
    <>
      <div className="dark hidden h-screen w-full flex-col overflow-x-hidden bg-bunker-800 md:flex">
        {!window.isSecureContext && <InsecureConnectionBanner />}
        <div className="flex grow flex-col overflow-y-hidden md:flex-row">
          <main className="flex-1 overflow-x-hidden overflow-y-auto bg-bunker-800 px-12 pt-10 pb-4 dark:scheme-dark">
            <Outlet />
          </main>
        </div>
      </div>
      <div className="z-200 flex h-screen w-screen flex-col items-center justify-center bg-bunker-800 md:hidden">
        <FontAwesomeIcon icon={faMobile} className="mb-8 text-7xl text-gray-300" />
        <p className="max-w-sm px-6 text-center text-lg text-gray-200">
          {` ${t("common.no-mobile")} `}
        </p>
      </div>
    </>
  );
};
