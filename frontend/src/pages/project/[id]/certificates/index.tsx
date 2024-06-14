import { useTranslation } from "react-i18next";
import Head from "next/head";

import { CertificatesPage } from "@app/views/Project/CertificatesPage";

const Certificates = () => {
  const { t } = useTranslation();

  return (
    <div className="h-full bg-bunker-800">
      <Head>
        <title>{t("common.head-title", { title: "Certificates" })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Head>
      <CertificatesPage />
    </div>
  );
};

export default Certificates;

Certificates.requireAuth = true;
