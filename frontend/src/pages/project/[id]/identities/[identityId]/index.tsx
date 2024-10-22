import { useTranslation } from "react-i18next";
import Head from "next/head";

import { IdentityDetailsPage } from "@app/views/Project/IdentityDetailsPage";

export default function ProjectIdentityDetailsPage() {
  const { t } = useTranslation();

  return (
    <>
      <Head>
        <title>{t("common.head-title", { title: t("settings.members.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <IdentityDetailsPage />
    </>
  );
}

ProjectIdentityDetailsPage.requireAuth = true;
