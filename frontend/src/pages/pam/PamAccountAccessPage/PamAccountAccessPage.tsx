import { useState } from "react";
import { Helmet } from "react-helmet";
import { useParams, useSearch } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";

import { PamAccountType, TPamAccount, useGetPamAccountById } from "@app/hooks/api/pam";
import { PamDataExplorerPage } from "@app/pages/pam/PamDataExplorerPage/PamDataExplorerPage";

import { AwsIamAccessContent } from "./AwsIamAccessContent";
import { DisconnectedScreen } from "./DisconnectedScreen";
import { RdpLauncher } from "./RdpLauncher";
import { SessionAccessGate } from "./ReasonGate";
import { useWebAccessSession } from "./useWebAccessSession";
import { WebAccessStatusCard } from "./WebAccessStatusCard";
import { WebPageContent } from "./WebPageContent";

const TerminalContent = ({
  account,
  reason,
  mfaSessionId
}: {
  account: TPamAccount;
  reason?: string;
  mfaSessionId?: string;
}) => {
  const [sessionEnded, setSessionEnded] = useState(false);

  const { containerRef, isConnected, disconnect, reconnect } = useWebAccessSession({
    accountId: account.id,
    accountType: account.accountType,
    reason,
    mfaSessionId,
    onSessionEnd: () => setSessionEnded(true)
  });

  const handleReconnect = () => {
    setSessionEnded(false);
    reconnect();
  };

  let statusLabel = "Connecting";
  let statusDotClass = "bg-warning";
  if (isConnected) {
    statusLabel = "Connected";
    statusDotClass = "bg-success";
  } else if (sessionEnded) {
    statusLabel = "Disconnected";
    statusDotClass = "bg-muted";
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-background">
      <div
        className="relative thin-scrollbar flex-1 overflow-x-auto overflow-y-hidden p-2 [&_.xterm-viewport]:thin-scrollbar"
        style={{ minHeight: 0 }}
      >
        <div ref={containerRef} className="h-full" style={{ minWidth: "100%" }} />
        {sessionEnded && <DisconnectedScreen onReconnect={handleReconnect} />}
      </div>
      <div className="flex items-center justify-between border-t border-border bg-card px-3 py-1.5 text-xs">
        <span className="flex items-center gap-1.5">
          <span className={`inline-block size-2 rounded-full ${statusDotClass}`} />
          <span className="text-muted">{statusLabel}</span>
          {isConnected && (
            <button
              type="button"
              onClick={disconnect}
              className="ml-2 text-muted hover:text-danger"
            >
              Disconnect
            </button>
          )}
        </span>
        <div className="flex items-center gap-4">
          <span>
            <span className="text-muted">Account:</span>{" "}
            <span className="text-muted">{account.name}</span>
          </span>
        </div>
      </div>
    </div>
  );
};

const PageContent = () => {
  const params = useParams({
    strict: false
  }) as {
    accountId?: string;
    accountType?: string;
  };

  const { accountId } = params;
  const { host: preselectedHost } = useSearch({ strict: false }) as { host?: string };
  const { data: account, isPending } = useGetPamAccountById(accountId);

  if (isPending) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-muted">
        Loading...
      </div>
    );
  }

  if (!account) {
    return (
      <WebAccessStatusCard
        tone="danger"
        icon={TriangleAlert}
        title="Account not found"
        description={`Could not find an account with ID ${accountId}.`}
      />
    );
  }

  if (account.accountType === PamAccountType.AwsIam) {
    return <AwsIamAccessContent account={account} />;
  }

  if (account.accountType === PamAccountType.SSH) {
    return <TerminalContent account={account} />;
  }

  return (
    <SessionAccessGate account={account}>
      {({ reason, mfaSessionId }) => {
        if (
          account.accountType === PamAccountType.Postgres ||
          account.accountType === PamAccountType.MySQL
        ) {
          return <PamDataExplorerPage reason={reason} mfaSessionId={mfaSessionId} />;
        }
        if (
          account.accountType === PamAccountType.Windows ||
          account.accountType === PamAccountType.WindowsAd
        ) {
          return (
            <RdpLauncher
              account={account}
              reason={reason}
              mfaSessionId={mfaSessionId}
              preselectedHost={preselectedHost}
            />
          );
        }
        if (account.accountType === PamAccountType.WebPage) {
          return <WebPageContent account={account} reason={reason} mfaSessionId={mfaSessionId} />;
        }
        return <TerminalContent account={account} reason={reason} mfaSessionId={mfaSessionId} />;
      }}
    </SessionAccessGate>
  );
};

export const PamAccountAccessPage = () => {
  return (
    <>
      <Helmet>
        <title>Web Access | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <PageContent />
    </>
  );
};
