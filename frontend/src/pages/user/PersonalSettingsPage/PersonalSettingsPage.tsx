import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link } from "@tanstack/react-router";

import { WishForm } from "@app/components/features/WishForm";
import { PageHeader } from "@app/components/v2";

import { PersonalTabGroup } from "./components/PersonalTabGroup";

export const PersonalSettingsPage = () => {
  const { t } = useTranslation();

  return (
    <div className="h-full bg-bunker-800 pt-10 text-white">
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.personal.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <div className="flex w-full justify-center px-6 text-white">
        <div className="w-full max-w-8xl">
          <Link to="/" className="mb-4 flex items-center gap-x-2 text-sm text-mineshaft-400">
            <FontAwesomeIcon icon={faChevronLeft} />
            Back to Organization
          </Link>
          <PageHeader
            title="Personal Settings"
            scope={null}
            description="Configure settings for your account"
          >
            <div>
              {window.location.origin.includes("https://app.infisical.com") ||
                window.location.origin.includes("https://gamma.infisical.com") || <WishForm />}
            </div>
          </PageHeader>
          <PersonalTabGroup />
        </div>
      </div>
    </div>
  );
};
