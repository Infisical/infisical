import { useTranslation } from "react-i18next";
import Head from "next/head";

import { SecretRotationPage } from "@app/views/SecretRotationPage";

const SecretRotation = () => {
  const { t } = useTranslation();

  return (
    <div className="h-full bg-bunker-800">
      <Head>
        <title>{t("common.head-title", { title: t("settings.project.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Head>
      <SecretRotationPage />
    </div>
  );
};

export default SecretRotation;

SecretRotation.requireAuth = true;
