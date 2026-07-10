import { useState } from "react";

import { TPamAccount } from "@app/hooks/api/pam";

import { DisconnectedScreen } from "./DisconnectedScreen";
import { useWebPageSession } from "./useWebPageSession";

type Props = {
  account: TPamAccount;
  reason?: string;
  mfaSessionId?: string;
};

export const WebPageContent = ({ account, reason, mfaSessionId }: Props) => {
  const [sessionEnded, setSessionEnded] = useState(false);

  const { canvasRef, isConnected, disconnect, reconnect } = useWebPageSession({
    accountId: account.id,
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
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-black p-2">
        {/* tabIndex makes the canvas focusable so it receives keyboard events */}
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          tabIndex={0}
          aria-label={`Web page session for ${account.name}`}
          className="max-h-full max-w-full outline-none"
          style={{ display: "block" }}
        />
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
