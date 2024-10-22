import Head from "next/head";

import { UserSecretsPage } from "@app/views/Project/UserSecretsPage";

const UserSecrets = () => {
  return (
    <div className="h-full bg-bunker-800">
      <Head>
        <title>Infisical | User Secrets</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Head>
      <UserSecretsPage />
    </div>
  );
};

export default UserSecrets;

UserSecrets.requireAuth = true;
