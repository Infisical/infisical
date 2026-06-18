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
  let statusDotClass = "bg-warning";
  if (isConnected) {
    statusLabel = "Connected";
    statusDotClass = "bg-success";
  } else if (error) {
    statusLabel = `Error: ${error}`;
    statusDotClass = "bg-danger";
  } else if (sessionEnded) {
    statusLabel = "Disconnected";
    statusDotClass = "bg-muted";
  }

  return (
    <div className="flex h-dvh w-screen flex-col bg-background">
      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden">
        {isConnecting && (
          <ContentLoader
            text="Connecting to remote desktop..."
            className="absolute inset-0 z-10 h-full"
          />
        )}
        {error && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4">
            <FontAwesomeIcon icon={faPlugCircleXmark} size="3x" className="text-danger/80" />
            <div className="flex flex-col items-center gap-1">
              <p className="text-sm font-medium text-foreground">Connection failed</p>
              <p className="max-w-md text-center text-xs text-muted">{error}</p>
            </div>
            <button
              type="button"
              onClick={handleReconnect}
              className="mt-2 rounded border border-border px-4 py-1.5 text-xs text-muted transition-colors hover:border-success hover:text-success"
            >
              Reconnect
            </button>
          </div>
        )}
        {sessionEnded && !error && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4">
            <FontAwesomeIcon icon={faCircleXmark} size="3x" className="text-muted" />
            <p className="text-sm text-muted">Session ended</p>
            <button
              type="button"
              onClick={handleReconnect}
              className="mt-2 rounded border border-border px-4 py-1.5 text-xs text-muted transition-colors hover:border-success hover:text-success"
            >
              Reconnect
            </button>
          </div>
        )}
      </div>
      <div className="flex h-[33px] shrink-0 items-center justify-between border-t border-border bg-card px-3 text-xs">
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
            <span className="text-muted">Resource:</span>{" "}
            <span className="text-muted">{resourceName}</span>
          </span>
          <span className="text-muted">|</span>
          <span>
            <span className="text-muted">Account:</span>{" "}
            <span className="text-muted">{account.name}</span>
          </span>
        </div>
      </div>
    </div>
  );
};
