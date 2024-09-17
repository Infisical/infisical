import Head from "next/head";

import { AzureEntraIdCallbackPage } from "@app/views/callback/AzureEntraIdCallbackPage";

const AzureEntraId = () => {
  return (
    <>
      <Head>
        <title>Infisical</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content="" />
        <meta name="og:description" content="" />
      </Head>
      <AzureEntraIdCallbackPage />
    </>
  );
};

export default AzureEntraId;

AzureEntraId.requireAuth = true;
