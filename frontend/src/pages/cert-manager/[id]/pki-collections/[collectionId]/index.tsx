/* eslint-disable @typescript-eslint/no-unused-vars */
import { useTranslation } from "react-i18next";
import Head from "next/head";

import { PkiCollectionPage } from "@app/views/Project/PkiCollectionPage";

export default function PkiCollection() {
  const { t } = useTranslation();
  return (
    <>
      <Head>
        <title>{t("common.head-title", { title: "PKI Collection" })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <PkiCollectionPage />
    </>
  );
}

PkiCollection.requireAuth = true;
