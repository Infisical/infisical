import { useState } from "react";
import { Helmet } from "react-helmet";
import { useParams } from "@tanstack/react-router";

import { PamAccountType, TPamAccount, useGetPamAccountById } from "@app/hooks/api/pam";
import { PamDataExplorerPage } from "@app/pages/pam/PamDataExplorerPage/PamDataExplorerPage";

import { SessionAccessGate } from "./ReasonGate";
import { useWebAccessSession } from "./useWebAccessSession";

const TerminalContent = ({
  account,
  orgId,
  reason
}: {
  account: TPamAccount;
  orgId: string;
  reason?: string;
}) => {
  const [sessionEnded, setSessionEnded] = useState(false);

  const { containerRef, isConnected, disconnect, reconnect } = useWebAccessSession({
    accountId: account.id,
    orgId,
    accountName: account.name,
    accountType: account.accountType,
    reason,
    onSessionEnd: () => setSessionEnded(true)
  });

  const handleReconnect = () => {
    setSessionEnded(false);
    reconnect();
  };

  let statusLabel = "Connecting";
  let statusDotClass = "bg-yellow-500";
  if (isConnected) {
    statusLabel = "Connected";
    statusDotClass = "bg-green-500";
  } else if (sessionEnded) {
    statusLabel = "Disconnected";
    statusDotClass = "bg-mineshaft-400";
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-[#0d1117]">
      <div
        className="thin-scrollbar flex-1 overflow-x-auto overflow-y-hidden p-2 [&_.xterm-viewport]:thin-scrollbar"
        style={{ minHeight: 0 }}
      >
        <div ref={containerRef} className="h-full" style={{ minWidth: "100%" }} />
      </div>
      <div className="flex items-center justify-between border-t border-mineshaft-600 bg-mineshaft-800 px-3 py-1.5 text-xs">
        <span className="flex items-center gap-1.5">
          <span className={`inline-block size-2 rounded-full ${statusDotClass}`} />
          <span className="text-mineshaft-300">{statusLabel}</span>
          {isConnected && (
            <button
              type="button"
              onClick={disconnect}
              className="ml-2 text-mineshaft-400 hover:text-red-400"
            >
              Disconnect
            </button>
          )}
          {sessionEnded && (
            <button
              type="button"
              onClick={handleReconnect}
              className="ml-2 text-mineshaft-400 hover:text-green-400"
            >
              Reconnect
            </button>
          )}
        </span>
        <div className="flex items-center gap-4">
          <span>
            <span className="text-mineshaft-400">Account:</span>{" "}
            <span className="text-mineshaft-300">{account.name}</span>
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
    orgId?: string;
    accountType?: string;
  };

  const { accountId, orgId } = params;
  const { data: account, isPending } = useGetPamAccountById(accountId);

  if (isPending) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0d1117] text-mineshaft-300">
        Loading...
      </div>
    );
  }

  if (!account) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0d1117]">
        <p className="text-mineshaft-300">Could not find PAM Account with ID {accountId}</p>
      </div>
    );
  }

  return (
    <SessionAccessGate account={account}>
      {({ reason }) => {
        if (account.accountType === PamAccountType.Postgres) {
          return <PamDataExplorerPage reason={reason} />;
        }
        return <TerminalContent account={account} orgId={orgId!} reason={reason} />;
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
