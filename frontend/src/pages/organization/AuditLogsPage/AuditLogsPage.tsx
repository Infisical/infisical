import { Helmet } from "react-helmet";

import { LogsSection } from "./components";

export const AuditLogsPage = () => {
  return (
    <div className="h-full bg-bunker-800">
      <Helmet>
        <title>Infisical | Audit Logs</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
      </Helmet>
      <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
        <div className="w-full max-w-7xl px-6">
          <div className="bg-bunker-800 py-6">
            <p className="text-3xl font-semibold text-gray-200">Audit Logs</p>
            <div />
          </div>
          <LogsSection filterClassName="static py-2" showFilters isOrgAuditLogs showActorColumn />
        </div>
      </div>
    </div>
  );
};
