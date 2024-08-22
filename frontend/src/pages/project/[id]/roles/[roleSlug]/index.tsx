/* eslint-disable @typescript-eslint/no-unused-vars */
import { useTranslation } from "react-i18next";
import Head from "next/head";

import { RolePage } from "@app/views/Project/RolePage";

export default function Role() {
  const { t } = useTranslation();
  return (
    <>
      <Head>
        <title>{t("common.head-title", { title: "Project Settings" })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <RolePage />
    </>
  );
}

Role.requireAuth = true;
