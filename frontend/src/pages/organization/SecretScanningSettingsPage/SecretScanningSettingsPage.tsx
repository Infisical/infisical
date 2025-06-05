import { Helmet } from "react-helmet";

import { ProjectSettings } from "@app/components/projects/ProjectSettings";
import { PageHeader } from "@app/components/v2";

export const SecretScanningSettingsPage = () => {
  return (
    <>
      <Helmet>
        <title>Secret Scanning Settings</title>
      </Helmet>
      <div className="flex w-full justify-center bg-bunker-800 text-white">
        <div className="w-full max-w-7xl">
          <PageHeader title="Secret Scanning Settings" />
          <ProjectSettings />
        </div>
      </div>
    </>
  );
};
