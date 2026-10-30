import { PageTitle } from "@app/components/PageTitle";
import { PageHeader } from "@app/components/v3";
import { useOrganization } from "@app/context";

import { NetworkingTabGroup } from "./components/NetworkingTabGroup/NetworkingTabGroup";

export const NetworkingPage = () => {
  const { isSubOrganization } = useOrganization();

  return (
    <>
      <PageTitle title="Networking" />
      <meta property="og:image" content="/images/message.png" />
      <div className="flex w-full justify-center bg-page text-foreground-inverse">
        <div className="flex w-full max-w-8xl flex-col">
          <PageHeader
            scope={isSubOrganization ? "namespace" : "org"}
            title="Networking"
            description="Manage gateways and relays that securely connect Infisical to your infrastructure"
          />
          <NetworkingTabGroup />
        </div>
      </div>
    </>
  );
};
