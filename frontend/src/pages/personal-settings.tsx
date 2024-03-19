import { useTranslation } from "react-i18next";
import Head from "next/head";

import { PersonalSettingsPage } from "@app/views/Settings/PersonalSettingsPage";

export default function PersonalSettings() {
  const { t } = useTranslation();

  return (
    <div className="h-full bg-bunker-800 text-white">
      <Head>
        <title>{t("common.head-title", { title: t("settings.personal.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <PersonalSettingsPage />
    </div>
  );
}

PersonalSettings.requireAuth = true;
