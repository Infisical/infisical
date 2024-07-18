/* eslint-disable @typescript-eslint/no-unused-vars */
import { useTranslation } from "react-i18next";
import Head from "next/head";

import { UserPage } from "@app/views/Org/UserPage";

export default function User() {
  const { t } = useTranslation();
  return (
    <>
      <Head>
        <title>{t("common.head-title", { title: t("settings.org.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <UserPage />
    </>
  );
}

User.requireAuth = true;
