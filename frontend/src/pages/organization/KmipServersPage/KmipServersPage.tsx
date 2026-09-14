import { Helmet } from "react-helmet";

import { KmipServerTab } from "./components";

export const KmipServersPage = () => {
  return (
    <>
      <Helmet>
        <title>Infisical | KMIP Servers</title>
        <meta property="og:image" content="/images/message.png" />
      </Helmet>
      <div className="mx-auto flex w-full max-w-8xl flex-col">
        <KmipServerTab />
      </div>
    </>
  );
};
