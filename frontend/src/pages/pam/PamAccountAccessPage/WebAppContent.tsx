import { Globe } from "lucide-react";

import { TPamAccount } from "@app/hooks/api/pam";

import { DisconnectedScreen } from "./DisconnectedScreen";
import { useWebAppSession } from "./useWebAppSession";
import { WebAccessStatusCard } from "./WebAccessStatusCard";

export const WebAppContent = ({
  account,
  reason,
  mfaSessionId
}: {
  account: TPamAccount;
  reason?: string;
  mfaSessionId?: string;
}) => {
  const { isConnected, error, frameDataUrl, frameCount, disconnect, reconnect } = useWebAppSession({
    accountId: account.id,
    reason,
    mfaSessionId
  });

  if (error) {
    return (
      <WebAccessStatusCard
        icon={Globe}
        tone="danger"
        title="Connection failed"
        description={error}
      />
    );
  }

  let statusLabel = "Connecting";
  let statusDotClass = "bg-warning";
  if (isConnected) {
    statusLabel = "Connected";
    statusDotClass = "bg-success";
  } else if (frameCount > 0) {
    statusLabel = "Disconnected";
    statusDotClass = "bg-muted";
  }

  return (
    <div className="flex h-screen w-screen flex-col bg-background">
      <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-bunker-900">
        {frameDataUrl ? (
          // eslint-disable-next-line jsx-a11y/alt-text -- decorative live screencast, not user-facing content
          <img src={frameDataUrl} className="max-h-full max-w-full" />
        ) : (
          <span className="text-sm text-muted">Waiting for first frame...</span>
        )}
        {!isConnected && frameCount > 0 && <DisconnectedScreen onReconnect={reconnect} />}
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
          <span className="text-muted">Frames: {frameCount}</span>
          <span>
            <span className="text-muted">Account:</span>{" "}
            <span className="text-muted">{account.name}</span>
          </span>
        </div>
      </div>
    </div>
  );
};
