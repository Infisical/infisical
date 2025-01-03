import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { faArrowUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ShareSecretSection } from "./components";

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
        <div className="container mx-auto h-full w-full max-w-7xl bg-bunker-800 px-6 text-white">
          <div className="flex items-center justify-between py-6">
            <div className="flex w-full flex-col">
              <h2 className="text-3xl font-semibold text-gray-200">Secret Sharing</h2>
              <p className="text-bunker-300">Share secrets securely using a shareable link</p>
            </div>
            <div className="flex w-max justify-center">
              <a
                target="_blank"
                rel="noopener noreferrer"
                href="https://infisical.com/docs/documentation/platform/secret-sharing"
              >
                <div className="flex w-max cursor-pointer items-center rounded-md border border-mineshaft-500 bg-mineshaft-600 px-4 py-2 text-mineshaft-200 duration-200 hover:border-primary/40 hover:bg-primary/10 hover:text-white">
                  Documentation{" "}
                  <FontAwesomeIcon
                    icon={faArrowUpRightFromSquare}
                    className="mb-[0.06rem] ml-1 text-xs"
                  />
                </div>
              </a>
            </div>
          </div>
          <ShareSecretSection />
        </div>
      </div>
    </>
  );
};
