import { useTranslation } from "react-i18next";
import Head from "next/head";

import { UserSecretPage } from "@app/views/UserSecretPage";

const UserSecrets = () => {
  const { t } = useTranslation();

  return (
    <>
      <Head>
        <h1>sdfsf</h1>
        <title>{t("usersecrets.title")} sdfsf</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={String(t("usersecrets.og-title"))} />
        <meta name="og:description" content={String(t("usersecrets.og-description"))} />
      </Head>
      <div className="h-full">
        <UserSecretPage />
      </div>
    </>
  );
};

export default UserSecrets;

UserSecrets.requireAuth = true;
