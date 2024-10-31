import { useTranslation } from "react-i18next";
import Head from "next/head";

import { UserSecretsPage } from "@app/views/Org/UserSecretsPage";

export default function UserSecrets() {
  const { t } = useTranslation();

  return (
    <>
      <Head>
        <title>{t("common.head-title", { title: "User Secrets" })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>

      <UserSecretsPage />
    </>
  );
}

UserSecrets.requireAuth = true;
