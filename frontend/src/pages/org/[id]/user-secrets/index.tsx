/* eslint-disable @typescript-eslint/no-unused-vars */
import { useTranslation } from "react-i18next";
import Head from "next/head";

import { UserSecretPage } from "@app/views/UserSecretPage/UserSecretPage";

export default function SettingsOrg() {
  const { t } = useTranslation();

  return (
    <>
      <Head>
        <title>{t("common.head-title", { title: "User Secrets" })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <UserSecretPage />
    </>
  );
}

SettingsOrg.requireAuth = true;
