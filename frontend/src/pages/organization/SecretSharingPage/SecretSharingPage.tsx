import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { faBookOpen, faArrowUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { PageHeader } from "@app/components/v2";

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
        <div className="container mx-auto h-full w-full max-w-7xl bg-bunker-800 text-white">
          <PageHeader
            title={
              <div className="flex w-full items-center">
                <span>Secret Sharing</span>
                <a
                  className="-mt-1.5"
                  href="https://infisical.com/docs/documentation/platform/secret-sharing"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <div className="ml-2 inline-block rounded-md bg-yellow/20 px-1.5 text-sm font-normal text-yellow opacity-80 hover:opacity-100">
                    <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
                    <span>Docs</span>
                    <FontAwesomeIcon
                      icon={faArrowUpRightFromSquare}
                      className="mb-[0.07rem] ml-1.5 text-[10px]"
                    />
                  </div>
                </a>
              </div>
            }
            description="Share secrets securely using a shareable link"
          >
          </PageHeader>
          <ShareSecretSection />
        </div>
      </div>
    </>
  );
};
