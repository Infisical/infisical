import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@app/components/v2";
import { ProjectType } from "@app/hooks/api/projects/types";

import { ShareSecretSection } from "./ShareSecretSection";

export const SecretSharingPage = () => {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: t("approval.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content={String(t("approval.og-title"))} />
        <meta name="og:description" content={String(t("approval.og-description"))} />
      </Helmet>
      <div className="h-full">
        <div className="mx-auto h-full w-full max-w-8xl bg-bunker-800 text-white">
          <PageHeader
            scope={ProjectType.SecretManager}
            title="Secret Sharing"
            description="Share secrets securely using a shareable link"
          />
          <ShareSecretSection />
        </div>
      </div>
    </>
  );
};
