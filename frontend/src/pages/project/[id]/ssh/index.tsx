import { useTranslation } from "react-i18next";
import Head from "next/head";

import { SshPage } from "@app/views/Project/SshPage";

const Ssh = () => {
  const { t } = useTranslation();

  return (
    <div className="h-full bg-bunker-800">
      <Head>
        <title>{t("common.head-title", { title: "Certificates" })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Head>
      <SshPage />
    </div>
  );
};

export default Ssh;

Ssh.requireAuth = true;
