import { useState } from "react";
import { Helmet } from "react-helmet";
import { useParams } from "@tanstack/react-router";

import { useGetPamAccountById } from "@app/hooks/api/pam";

import { useWebAccessSession } from "./useWebAccessSession";

const PageContent = () => {
  const params = useParams({
    strict: false
  }) as {
    accountId?: string;
    projectId?: string;
    orgId?: string;
    resourceType?: string;
    resourceId?: string;
  };

  const { accountId, projectId, orgId } = params;

  const { data: account, isPending } = useGetPamAccountById(accountId);

  const [sessionEnded, setSessionEnded] = useState(false);

  const { containerRef, isConnected, disconnect, reconnect } = useWebAccessSession({
    accountId: accountId!,
    projectId: projectId!,
    orgId: orgId!,
    resourceName: account?.resource.name ?? "",
    accountName: account?.name ?? "",
    resourceType: account?.resource.resourceType ?? "",
    onSessionEnd: () => setSessionEnded(true)
  });

  const handleReconnect = () => {
    setSessionEnded(false);
    reconnect();
  };

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
            <span className="text-mineshaft-400">Resource:</span>{" "}
            <span className="text-mineshaft-300">{account.resource.name}</span>
          </span>
          <span className="text-mineshaft-500">|</span>
          <span>
            <span className="text-mineshaft-400">Account:</span>{" "}
            <span className="text-mineshaft-300">{account.name}</span>
          </span>
        </div>
      </div>
    </div>
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
