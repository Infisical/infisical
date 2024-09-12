import { useTranslation } from "react-i18next";
import Head from "next/head";

import { IntegrationDetails } from "@app/views/IntegrationsPage/DetailsPage/DetailsPage";

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
      <IntegrationDetails />
    </>
  );
}

IntegrationsDetailsPage.requireAuth = true;
