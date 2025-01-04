/* eslint-disable @typescript-eslint/no-unused-vars */
import { useTranslation } from "react-i18next";
import Head from "next/head";

import { IdentityPage } from "@app/views/Org/IdentityPage";

export default function Identity() {
  const { t } = useTranslation();
  return (
    <>
      <Head>
        <title>{t("common.head-title", { title: t("settings.org.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <IdentityPage />
    </>
  );
}

Identity.requireAuth = true;
