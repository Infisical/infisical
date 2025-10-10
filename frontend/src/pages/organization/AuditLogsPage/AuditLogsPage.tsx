import { Helmet } from "react-helmet";

import { PageHeader } from "@app/components/v2";

import { LogsSection } from "./components";

export const AuditLogsPage = () => {
  return (
    <div className="bg-bunker-800 h-full">
      <Helmet>
        <title>Infisical | Audit Logs</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Helmet>

      <div className="bg-bunker-800 flex h-full w-full justify-center text-white">
        <div className="w-full max-w-7xl">
          <PageHeader
            title="Audit logs"
            description="Audit logs for security and compliance teams to monitor information access."
          />
          <LogsSection pageView />
        </div>
      </div>
    </div>
  );
};
