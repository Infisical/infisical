import { Helmet } from "react-helmet";

import { ProjectSettings } from "@app/components/projects/ProjectSettings";
import { PageHeader } from "@app/components/v2";

export const SecretManagerSettingsPage = () => {
  return (
    <>
      <Helmet>
        <title>Secret Management Settings</title>
      </Helmet>
      <div className="flex w-full justify-center bg-bunker-800 text-white">
        <div className="w-full max-w-7xl">
          <PageHeader title="Secret Management Settings" />
          <ProjectSettings />
        </div>
      </div>
    </>
  );
};
