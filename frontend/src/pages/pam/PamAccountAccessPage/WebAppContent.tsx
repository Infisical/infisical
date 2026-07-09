import { useCallback, useRef } from "react";
import { Globe } from "lucide-react";

import { TPamAccount } from "@app/hooks/api/pam";

import { mapKeyToCdp } from "./cdpKeyMap";
import { DisconnectedScreen } from "./DisconnectedScreen";
import { TMouseEventParams, useWebAppSession } from "./useWebAppSession";
import { WebAccessStatusCard } from "./WebAccessStatusCard";

const MOUSE_BUTTON_NAMES: Record<number, TMouseEventParams["button"]> = {
  0: "left",
  1: "middle",
  2: "right"
};

export const WebAppContent = ({
  account,
  reason,
  mfaSessionId
}: {
  account: TPamAccount;
  reason?: string;
  mfaSessionId?: string;
}) => {
  const {
    isConnected,
    error,
    frameDataUrl,
    frameMetadata,
    frameCount,
    disconnect,
    reconnect,
    dispatchMouseEvent,
    dispatchKeyEvent
  } = useWebAppSession({
    accountId: account.id,
    reason,
    mfaSessionId
  });

  const surfaceRef = useRef<HTMLDivElement | null>(null);

  // Maps a DOM mouse position (relative to the rendered frame) into the CDP
  // viewport coordinate space reported in the latest screencast frame's
  // metadata - the displayed image is scaled to fit the container, so a raw
  // clientX/clientY isn't usable directly.
  const toFrameCoords = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const surface = surfaceRef.current;
      if (!surface || !frameMetadata) return null;
      const rect = surface.getBoundingClientRect();
      const scaleX = frameMetadata.deviceWidth / rect.width;
      const scaleY = frameMetadata.deviceHeight / rect.height;
      return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
    },
    [frameMetadata]
  );

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      surfaceRef.current?.focus();
      const coords = toFrameCoords(event.clientX, event.clientY);
      if (!coords) return;
      dispatchMouseEvent({
        type: "mousePressed",
        ...coords,
        button: MOUSE_BUTTON_NAMES[event.button] ?? "left"
      });
    },
    [toFrameCoords, dispatchMouseEvent]
  );

  const handleMouseUp = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      event.preventDefault();
      const coords = toFrameCoords(event.clientX, event.clientY);
      if (!coords) return;
      dispatchMouseEvent({
        type: "mouseReleased",
        ...coords,
        button: MOUSE_BUTTON_NAMES[event.button] ?? "left"
      });
    },
    [toFrameCoords, dispatchMouseEvent]
  );

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const coords = toFrameCoords(event.clientX, event.clientY);
      if (!coords) return;
      dispatchMouseEvent({ type: "mouseMoved", ...coords, button: "none" });
    },
    [toFrameCoords, dispatchMouseEvent]
  );

  const handleWheel = useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      const coords = toFrameCoords(event.clientX, event.clientY);
      if (!coords) return;
      dispatchMouseEvent({
        type: "mouseWheel",
        ...coords,
        button: "none",
        deltaX: -event.deltaX,
        deltaY: -event.deltaY
      });
    },
    [toFrameCoords, dispatchMouseEvent]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      event.preventDefault();
      const fields = mapKeyToCdp(event.key);
      dispatchKeyEvent({ type: "keyDown", ...fields });
    },
    [dispatchKeyEvent]
  );

  const handleKeyUp = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      event.preventDefault();
      const fields = mapKeyToCdp(event.key);
      dispatchKeyEvent({ type: "keyUp", ...fields });
    },
    [dispatchKeyEvent]
  );

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
          /* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- remote-control surface for the live session; no standard ARIA widget role fits this */
          <div
            ref={surfaceRef}
            role="application"
            aria-label="Live web session - click to interact"
            tabIndex={0}
            className="flex cursor-default items-center justify-center outline-none"
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseMove={handleMouseMove}
            onWheel={handleWheel}
            onContextMenu={(event) => event.preventDefault()}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
          >
            {/* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
            <img
              src={frameDataUrl}
              className="max-h-full max-w-full"
              alt="Live session"
              draggable={false}
            />
          </div>
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
