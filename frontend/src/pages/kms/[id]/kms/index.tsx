import { useTranslation } from "react-i18next";
import Head from "next/head";

import { KmsPage } from "@app/views/Project/KmsPage";

const KMS = () => {
  const { t } = useTranslation();

  return (
    <div className="h-full bg-bunker-800">
      <Head>
        <title>{t("common.head-title", { title: "KMS" })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Head>
      <KmsPage />
    </div>
  );
};

export default KMS;

KMS.requireAuth = true;
