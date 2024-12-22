import { useTranslation } from "react-i18next";
import Head from "next/head";

import { UserSecretsSection } from "@app/views/UserSecrets/components/UserSecretsSection";

export default function UserSecretsPage() {
  const { t } = useTranslation();

  return (
    <>
      <Head>
        <title>{t("common.head-title", { title: "User Secrets" })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content="Manage your personal secrets" />
        <meta 
          name="og:description" 
          content="Securely store and manage your personal credentials, passwords, and sensitive information" 
        />
      </Head>
      <div className="h-full bg-bunker-800">
        <UserSecretsSection />
      </div>
    </>
  );
}

// This ensures the page requires authentication
UserSecretsPage.requireAuth = true; 