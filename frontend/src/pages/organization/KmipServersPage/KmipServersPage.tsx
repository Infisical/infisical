import { Helmet } from "react-helmet";

import { KmipServerTab } from "./components";

export const KmipServersPage = () => {
  return (
    <>
      <Helmet>
        <title>Infisical | KMIP Servers</title>
        <meta property="og:image" content="/images/message.png" />
      </Helmet>
      <div className="flex w-full justify-center bg-background text-foreground">
        <div className="w-full max-w-8xl">
          <KmipServerTab />
        </div>
      </div>
    </>
  );
};
