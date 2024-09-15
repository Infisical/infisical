import { useTranslation } from "react-i18next";
import Head from "next/head";
import frameworkIntegrations from "public/json/frameworkIntegrations.json";
import infrastructureIntegrations from "public/json/infrastructureIntegrations.json";

import { IntegrationsPage } from "@app/views/IntegrationsPage";

const Integration = () => {
  const { t } = useTranslation();

  return (
    <>
      <Head>
        <title>{t("common.head-title", { title: t("integrations.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content="Manage your .env files in seconds" />
        <meta name="og:description" content={t("integrations.description") as string} />
      </Head>
      <IntegrationsPage
        frameworkIntegrations={frameworkIntegrations}
        infrastructureIntegrations={infrastructureIntegrations}
      />
    </>
  );
};

Integration.requireAuth = true;

export default Integration;
