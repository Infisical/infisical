/* eslint-disable @typescript-eslint/no-unused-vars */
import { useTranslation } from "react-i18next";
import Head from "next/head";

import { GlobToolPage } from "@app/views/GlobToolPage";

export default function GlobTool() {
  const { t } = useTranslation();

  return (
    <>
      <Head>
        <title>{t("common.head-title", { title: t("section.glob-tool.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content="" />
        <meta name="og:description" content="" />
        <link rel="icon" href="/infisical.ico" />
      </Head>

      <div className="dark h-full">
        <GlobToolPage />
      </div>
    </>
  );
}
