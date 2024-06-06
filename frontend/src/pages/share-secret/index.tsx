import Head from "next/head";

import { ShareSecretPublicPage } from "@app/views/ShareSecretPublicPage";

const SecretApproval = () => {
  return (
    <>
      <Head>
        <title>Securely Share Secrets | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content="" />
        <meta name="og:description" content="" />
      </Head>
      <div className="h-full">
        <ShareSecretPublicPage />
      </div>
    </>
  );
};

export default SecretApproval;

SecretApproval.requireAuth = false;
