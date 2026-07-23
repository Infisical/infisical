import { useState } from "react";
import { TriangleAlert } from "lucide-react";

import { ContentLoader } from "@app/components/v2";
import { Button } from "@app/components/v3";
import { TPamAccount } from "@app/hooks/api/pam";

import { DisconnectedScreen } from "./DisconnectedScreen";
import { useWebBrowserSession } from "./useWebBrowserSession";
import { WebAccessStatusCard } from "./WebAccessStatusCard";

type WebBrowserContentProps = {
  account: TPamAccount;
  reason?: string;
  mfaSessionId?: string;
};

export const WebBrowserContent = ({ account, reason, mfaSessionId }: WebBrowserContentProps) => {
  const [sessionEnded, setSessionEnded] = useState(false);

  const { canvasRef, isConnected, error, handleCanvasClick, reconnect } = useWebBrowserSession({
    accountId: account.id,
    reason,
    mfaSessionId,
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
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          className="mx-auto h-full max-h-full w-auto max-w-full cursor-pointer bg-white"
        />
        {isConnecting && (
          <ContentLoader
            text="Starting isolated browser session..."
            className="absolute inset-0 z-10 h-full"
          />
        )}
        {error && (
          <WebAccessStatusCard
            overlay
            tone="danger"
            icon={TriangleAlert}
            title="Connection failed"
            description={error}
          >
            <Button variant="pam" isFullWidth onClick={handleReconnect}>
              Reconnect
            </Button>
          </WebAccessStatusCard>
        )}
        {sessionEnded && !error && <DisconnectedScreen onReconnect={handleReconnect} />}
      </div>
      <div className="flex h-[33px] shrink-0 items-center justify-between border-t border-border bg-card px-3 text-xs">
        <span className="flex items-center gap-1.5">
          <span className={`inline-block size-2 rounded-full ${statusDotClass}`} />
          <span className="text-muted">{statusLabel}</span>
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
