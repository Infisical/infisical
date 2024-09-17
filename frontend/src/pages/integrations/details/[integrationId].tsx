import { useTranslation } from "react-i18next";
import Head from "next/head";

import { IntegrationDetailsPage } from "@app/views/IntegrationsPage/IntegrationDetailsPage";

export default function IntegrationsDetailsPage() {
  const { t } = useTranslation();

  return (
    <>
      <Head>
        <title>Integration Details | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content="Manage your .env files in seconds" />
        <meta name="og:description" content={t("integrations.description") as string} />
      </Head>
      <IntegrationDetailsPage />
    </>
  );
}

IntegrationsDetailsPage.requireAuth = true;
