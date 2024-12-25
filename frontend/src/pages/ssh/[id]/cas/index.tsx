import { useTranslation } from "react-i18next";
import Head from "next/head";

import { SshCasPage } from "@app/views/Project/SshCasPage";

const SshCas = () => {
  const { t } = useTranslation();

  return (
    <div className="h-full bg-bunker-800">
      <Head>
        <title>{t("common.head-title", { title: "Certificate Authorities" })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Head>
      <SshCasPage />
    </div>
  );
};

export default SshCas;

SshCas.requireAuth = true;