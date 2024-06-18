import Head from "next/head";

import { ShareSecretPublicPage } from "@app/views/ShareSecretPublicPage";

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
      <div className="dark h-full">
        <ShareSecretPublicPage isNewSession={false} />
      </div>
    </>
  );
};

export default SecretSharedPublicPage;

SecretSharedPublicPage.requireAuth = false;
