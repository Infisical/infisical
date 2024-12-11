/* eslint-disable @typescript-eslint/no-unused-vars */
import { useTranslation } from "react-i18next";
import Head from "next/head";

import { MembersPage } from "@app/views/Project/MembersPage";

export default function WorkspaceMemberSettings() {
  const { t } = useTranslation();

  return (
    <>
      <Head>
        <title>{t("common.head-title", { title: t("settings.members.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <MembersPage />
    </>
  );
}

WorkspaceMemberSettings.requireAuth = true;
