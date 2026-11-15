import { PageTitle } from "@app/components/PageTitle";

import { KmipServerTab } from "./components";

export const KmipServersPage = () => {
  return (
    <>
      <PageTitle title="KMIP Servers" />
      <meta property="og:image" content="/images/message.png" />
      <div className="flex w-full justify-center bg-page text-foreground-inverse">
        <div className="w-full max-w-8xl">
          <KmipServerTab />
        </div>
      </div>
    </>
  );
};
