import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@app/components/v3";
import { ProjectType } from "@app/hooks/api/projects/types";

import { ShareSecretSection } from "./ShareSecretSection";

export const SecretSharingPage = () => {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: "Secret Sharing" })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content="Secret Sharing" />
        <meta
          name="og:description"
          content="Share sensitive information through secure, expiring links."
        />
      </Helmet>
      <div className="h-full">
        <div className="mx-auto h-full w-full max-w-8xl text-white">
          <PageHeader
            scope={ProjectType.SecretManager}
            title="Secret Sharing"
            description="Send and request sensitive information through secure, expiring links."
          />
          <ShareSecretSection />
        </div>
      </div>
    </>
  );
};
