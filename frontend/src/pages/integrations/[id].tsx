import { useTranslation } from "react-i18next";
import Head from "next/head";
import frameworkIntegrationOptions from "public/json/frameworkIntegrations.json";
import infrastructureIntegrationOptions from "public/json/infrastructureIntegrations.json";

import { IntegrationsPage } from "@app/views/IntegrationsPage";

type Props = {
  frameworkIntegrations: typeof frameworkIntegrationOptions;
  infrastructureIntegrations: typeof infrastructureIntegrationOptions; 
};

const Integration = ({ frameworkIntegrations, infrastructureIntegrations }: Props) => {
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
      <IntegrationsPage frameworkIntegrations={frameworkIntegrations} infrastructureIntegrations={infrastructureIntegrations} />
    </>
  );
};

export const getStaticProps = () => {
  return {
    props: {
      frameworkIntegrations: frameworkIntegrationOptions,
      infrastructureIntegrations: infrastructureIntegrationOptions
    }
  };
};

export const getStaticPaths = async () => {
  return {
    paths: [], // indicates that no page needs be created at build time
    fallback: "blocking" // indicates the type of fallback
  };
};

Integration.requireAuth = true;

export default Integration;
