import { useState } from "react";
import { faCircleXmark, faPlugCircleXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { ContentLoader } from "@app/components/v2";
import { TPamAccount } from "@app/hooks/api/pam";

import { useRdpSession } from "./useRdpSession";

type RdpContentProps = {
  account: TPamAccount;
  projectId: string;
  resourceId: string;
  resourceName: string;
  reason?: string;
};

export const RdpContent = ({
  account,
  projectId,
  resourceId,
  resourceName,
  reason
}: RdpContentProps) => {
  const [sessionEnded, setSessionEnded] = useState(false);

  const { containerRef, isConnected, error, disconnect, reconnect } = useRdpSession({
    accountId: account.id,
    projectId,
    resourceId,
    resourceName,
    destination: resourceName,
    reason,
    onSessionEnd: () => setSessionEnded(true)
  });

  const handleReconnect = () => {
    setSessionEnded(false);
    reconnect();
  };

  const isConnecting = !isConnected && !error && !sessionEnded;

  let statusLabel = "Connecting";
  let statusDotClass = "bg-yellow-500";
  if (isConnected) {
    statusLabel = "Connected";
    statusDotClass = "bg-green-500";
  } else if (error) {
    statusLabel = `Error: ${error}`;
    statusDotClass = "bg-red-500";
  } else if (sessionEnded) {
    statusLabel = "Disconnected";
    statusDotClass = "bg-mineshaft-400";
  }

  return (
    <div className="flex h-dvh w-screen flex-col bg-[#0d1117]">
      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden">
        {isConnecting && (
          <ContentLoader
            text="Connecting to remote desktop..."
            className="absolute inset-0 z-10 h-full"
          />
        )}
        {error && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4">
            <FontAwesomeIcon icon={faPlugCircleXmark} size="3x" className="text-red-500/80" />
            <div className="flex flex-col items-center gap-1">
              <p className="text-sm font-medium text-mineshaft-200">Connection failed</p>
              <p className="max-w-md text-center text-xs text-mineshaft-400">{error}</p>
            </div>
            <button
              type="button"
              onClick={handleReconnect}
              className="mt-2 rounded border border-mineshaft-500 px-4 py-1.5 text-xs text-mineshaft-300 transition-colors hover:border-green-700 hover:text-green-400"
            >
              Reconnect
            </button>
          </div>
        )}
        {sessionEnded && !error && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4">
            <FontAwesomeIcon icon={faCircleXmark} size="3x" className="text-mineshaft-400" />
            <p className="text-sm text-mineshaft-300">Session ended</p>
            <button
              type="button"
              onClick={handleReconnect}
              className="mt-2 rounded border border-mineshaft-500 px-4 py-1.5 text-xs text-mineshaft-300 transition-colors hover:border-green-700 hover:text-green-400"
            >
              Reconnect
            </button>
          </div>
        )}
      </div>
      <div className="flex h-[33px] shrink-0 items-center justify-between border-t border-mineshaft-600 bg-mineshaft-800 px-3 text-xs">
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
        </span>
        <div className="flex items-center gap-4">
          <span>
            <span className="text-mineshaft-400">Resource:</span>{" "}
            <span className="text-mineshaft-300">{resourceName}</span>
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
