import Head from "next/head";

import { ViewSecretPublicPage } from "@app/views/ViewSecretPublicPage";

const SecretSharedPublicPage = () => {
  return (
    <>
      <Head>
        <title>Securely Share Secrets | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content="" />
        <meta name="og:description" content="" />
      </Head>
      <ViewSecretPublicPage />
    </>
  );
};

export default SecretSharedPublicPage;

SecretSharedPublicPage.requireAuth = false;
