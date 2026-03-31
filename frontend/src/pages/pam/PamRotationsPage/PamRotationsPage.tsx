import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";

import { PageHeader } from "@app/components/v2";
import { ProjectType } from "@app/hooks/api/projects/types";

import { PamRotationsSection } from "./components/PamRotationsSection";

export const PamRotationsPage = () => {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: "PAM" })}</title>
      </Helmet>
      <div className="h-full bg-bunker-800">
        <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
          <div className="mx-auto mb-6 w-full max-w-8xl">
            <PageHeader
              scope={ProjectType.PAM}
              title="Rotation Policies"
              description="Manage automatic credential rotation policies."
            />
            <PamRotationsSection />
          </div>
        </div>
      </div>
    </>
  );
};
