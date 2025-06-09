import { Helmet } from "react-helmet";

import { ProjectSettings } from "@app/components/projects/ProjectSettings";
import { PageHeader } from "@app/components/v2";

export const CertManagerSettingsPage = () => {
  return (
    <>
      <Helmet>
        <title>Cert Management Settings</title>
      </Helmet>
      <div className="flex w-full justify-center bg-bunker-800 text-white">
        <div className="w-full max-w-7xl">
          <PageHeader title="Cert Management Settings" />
          <ProjectSettings />
        </div>
      </div>
    </>
  );
};
