import { PageTitle } from "@app/components/PageTitle";

import { PageHeader } from "@app/components/v3";
import { ProjectType } from "@app/hooks/api/projects/types";

import { KmipServerTab } from "./components";

export const KmipServersPage = () => {
  return (
    <>
      <PageTitle title="KMIP Servers" />
      <meta property="og:image" content="/images/message.png" />
      <div className="flex w-full justify-center bg-page text-foreground-inverse">
        <div className="w-full max-w-8xl">
          <PageHeader
            scope={ProjectType.KMS}
            title="KMIP Servers"
            description="KMIP servers you run on your network that let KMIP clients manage their keys in Infisical KMS."
          />
          <KmipServerTab />
        </div>
      </div>
    </>
  );
};
