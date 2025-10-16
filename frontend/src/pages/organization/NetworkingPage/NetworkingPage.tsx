import { Helmet } from "react-helmet";

import { PageHeader } from "@app/components/v2";

import { NetworkingTabGroup } from "./components/NetworkingTabGroup/NetworkingTabGroup";

export const NetworkingPage = () => {
  return (
    <>
      <Helmet>
        <title>Infisical | Networking</title>
        <meta property="og:image" content="/images/message.png" />
      </Helmet>
      <div className="flex w-full justify-center bg-bunker-800 text-white">
        <div className="w-full max-w-7xl">
          <PageHeader
            scope="org"
            title="Networking"
            description="Manage gateways and relays to securely access private network resources from Infisical"
          />
          <NetworkingTabGroup />
        </div>
      </div>
    </>
  );
};
