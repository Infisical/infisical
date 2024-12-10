import { useTranslation } from "react-i18next";
import Head from "next/head";

import { GroupPage } from "@app/views/Org/GroupPage";

export default function Group() {
  const { t } = useTranslation();
  return (
    <>
      <Head>
        <title>{t("common.head-title", { title: t("settings.org.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <GroupPage />
    </>
  );
}

Group.requireAuth = true;
