import Head from "next/head";

import { AuditLogsPage } from "@app/views/Org/AuditLogsPage";

const Logs = () => {
  return (
    <div className="h-full bg-bunker-800">
      <Head>
        <title>Infisical | Audit Logs</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Head>
      <AuditLogsPage />
    </div>
  );
};

export default Logs;

Logs.requireAuth = true;
