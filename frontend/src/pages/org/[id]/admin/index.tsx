/* eslint-disable @typescript-eslint/no-unused-vars */
import { useTranslation } from "react-i18next";
import Head from "next/head";

import { OrgAdminPage } from "@app/views/OrgAdminPage";

export default function SettingsOrg() {
  const { t } = useTranslation();

  return (
    <>
      <Head>
        <title>{t("common.head-title", { title: t("settings.org.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <OrgAdminPage />
    </>
  );
}

SettingsOrg.requireAuth = true;
