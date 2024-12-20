import { useTranslation } from "react-i18next";
import Head from "next/head";

import { MemberDetailsPage } from "@app/views/Project/MemberDetailsPage";

export default function Page() {
  const { t } = useTranslation();

  return (
    <>
      <Head>
        <title>{t("common.head-title", { title: t("settings.members.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <MemberDetailsPage />
    </>
  );
}

Page.requireAuth = true;
