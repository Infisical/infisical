import { useTranslation } from "react-i18next";
import Head from "next/head";

import { ConsumerSecretsPage } from "@app/views/ConsumerSecretsPage";

const ConsumerSecretsApproval = () => {
  const { t } = useTranslation();

  return (
    <>
      <Head>
        <title>{t("common.head-title", { title: t("approval.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={String(t("approval.og-title"))} />
        <meta name="og:description" content={String(t("approval.og-description"))} />
      </Head>
      <div className="h-full">
        <ConsumerSecretsPage />
      </div>
    </>
  );
};

export default ConsumerSecretsApproval;

ConsumerSecretsApproval.requireAuth = true;
