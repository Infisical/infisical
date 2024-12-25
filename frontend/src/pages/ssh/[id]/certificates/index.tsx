import { useTranslation } from "react-i18next";
import Head from "next/head";

import { SshCertificatesPage } from "@app/views/Project/SshCertificatesPage";

const SshCertificates = () => {
  const { t } = useTranslation();

  return (
    <div className="h-full bg-bunker-800">
      <Head>
        <title>{t("common.head-title", { title: "Certificates" })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Head>
      <SshCertificatesPage />
    </div>
  );
};

export default SshCertificates;

SshCertificates.requireAuth = true;