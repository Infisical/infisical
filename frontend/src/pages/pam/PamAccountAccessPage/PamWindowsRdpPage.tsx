import { useState } from "react";

import { useGetPamAccountById } from "@app/hooks/api/pam";

import { useRdpSession } from "./useRdpSession";

/**
 * Browser-side RDP session page. Rendered by PamAccountAccessPage for
 * Windows resources.
 *
 * Phase 4 scaffold: the WebSocket lifecycle and page chrome are wired;
 * the actual RDP rendering (IronRDP WASM into the canvas) is TODO. See
 * useRdpSession for the full list of remaining integration points.
 */
export const PamWindowsRdpPage = ({
  accountId,
  projectId,
  orgId
}: {
  accountId: string;
  projectId: string;
  orgId: string;
}) => {
  const { data: account, isPending } = useGetPamAccountById(accountId);
  const [sessionEnded, setSessionEnded] = useState(false);

  const { canvasRef, isConnected, disconnect, reconnect } = useRdpSession({
    accountId,
    projectId,
    orgId,
    resourceName: account?.resource.name ?? "",
    accountName: account?.name ?? "",
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
      <div className="thin-scrollbar flex-1 overflow-auto p-2" style={{ minHeight: 0 }}>
        <canvas
          ref={canvasRef}
          width={1920}
          height={1080}
          tabIndex={0}
          className="mx-auto block max-h-full max-w-full bg-black focus:outline-none"
        />
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
