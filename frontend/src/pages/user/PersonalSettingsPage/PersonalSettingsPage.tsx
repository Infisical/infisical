import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";

import { WishForm } from "@app/components/features/WishForm";

import { PersonalTabGroup } from "./components/PersonalTabGroup";

export const PersonalSettingsPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate({ from: "/personal-settings/" });
  const { selectedTab } = useSearch({
    from: "/_authenticate/personal-settings/_layout/"
  });

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.personal.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <Link
        to="/"
        className="mb-6 inline-flex items-center gap-2 rounded-sm text-sm text-muted transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <ArrowLeftIcon className="size-4" />
        Back to organization
      </Link>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Personal Settings</h1>
          <p className="mt-1 text-sm text-muted">
            Manage your profile, authentication, and active sessions.
          </p>
        </div>
        {!window.location.origin.includes("https://app.infisical.com") &&
          !window.location.origin.includes("https://gamma.infisical.com") && <WishForm />}
      </header>
      <PersonalTabGroup
        selectedTab={selectedTab}
        onTabChange={(nextTab) =>
          navigate({
            search: (previous) => ({ ...previous, selectedTab: nextTab }),
            replace: true
          })
        }
      />
    </div>
  );
};
