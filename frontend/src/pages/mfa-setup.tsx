import Head from "next/head";

import { MfaSetupPage } from "@app/views/Settings/MfaSetupPage";

export default function MfaSetup() {

  return (
    <div className="h-full bg-bunker-800">
      <Head>
        <title>Configure MFA</title>
        <link rel="icon" href="/infisical.ico" />
      </Head>
      <MfaSetupPage />
    </div>
  );
}

MfaSetup.requireAuth = true;