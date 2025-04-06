import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@app/components/v2";

import { SshHostsSection } from "./components";

export const SshHostsPage = () => {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: "Certificates" })}</title>
      </Helmet>
      <div className="h-full bg-bunker-800">
        <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
          <div className="mx-auto mb-6 w-full max-w-7xl">
            <PageHeader
              title="Overview"
              description="Infisical SSH lets you issue SSH credentials to clients to provide short-lived, secure SSH access to infrastructure."
            />
            <SshHostsSection />
          </div>
        </div>
      </div>
    </>
  );
};
