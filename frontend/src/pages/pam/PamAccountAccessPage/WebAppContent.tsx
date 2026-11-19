import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Globe, RotateCw, TriangleAlert } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { Button, IconButton, Input, PageLoader } from "@app/components/v3";
import { TPamAccount } from "@app/hooks/api/pam";

import { DisconnectedScreen } from "./DisconnectedScreen";
import { useWebAppSession } from "./useWebAppSession";
import {
  mapPointToFrame,
  MAX_PASTE_CHARS,
  modifiersFromEvent,
  mouseButtonFromEvent,
  WHEEL_LINE_PIXELS
} from "./web-app-protocol";
import { WebAccessStatusCard } from "./WebAccessStatusCard";

type Props = {
  account: TPamAccount;
  reason?: string;
  mfaSessionId?: string;
};

// The browser handles these itself so the paste event fires and carries the clipboard text
const isPasteShortcut = (event: KeyboardEvent) =>
  (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v";

export const WebAppContent = ({ account, reason, mfaSessionId }: Props) => {
  const {
    containerRef,
    canvasRef,
    status,
    error,
    endReason,
    pageState,
    frameSize,
    send,
    disconnect,
    reconnect
  } = useWebAppSession({ accountId: account.id, reason, mfaSessionId });

  const isConnected = status === "connected";
  const [addressDraft, setAddressDraft] = useState<string | null>(null);

  const isConnectedRef = useRef(isConnected);
  isConnectedRef.current = isConnected;

  const hasFrame = Boolean(frameSize);
  useEffect(() => {
    if (hasFrame) canvasRef.current?.focus();
  }, [hasFrame, canvasRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let pendingMove: MouseEvent | null = null;
    let moveFrame: number | null = null;
    let isDragging = false;

    const toFrame = (event: MouseEvent) =>
      mapPointToFrame(event, canvas.getBoundingClientRect(), {
        width: canvas.width,
        height: canvas.height
      });

    const sendMouse = (
      event: MouseEvent,
      action: "down" | "up" | "move" | "wheel",
      extra: { deltaX?: number; deltaY?: number } = {}
    ) => {
      if (!isConnectedRef.current) return;
      const { x, y } = toFrame(event);
      send({
        type: "mouse",
        action,
        x,
        y,
        button: action === "down" || action === "up" ? mouseButtonFromEvent(event.button) : "none",
        buttons: event.buttons,
        clickCount: action === "down" || action === "up" ? Math.max(event.detail, 1) : 0,
        deltaX: extra.deltaX ?? 0,
        deltaY: extra.deltaY ?? 0,
        modifiers: modifiersFromEvent(event)
      });
    };

    const flushMove = () => {
      if (moveFrame !== null) {
        cancelAnimationFrame(moveFrame);
        moveFrame = null;
      }
      if (pendingMove) {
        sendMouse(pendingMove, "move");
        pendingMove = null;
      }
    };

    const onMouseMove = (event: MouseEvent) => {
      if (event.target !== canvas && !isDragging) return;
      pendingMove = event;
      if (moveFrame === null) {
        moveFrame = requestAnimationFrame(() => {
          moveFrame = null;
          if (pendingMove) {
            sendMouse(pendingMove, "move");
            pendingMove = null;
          }
        });
      }
    };

    const onMouseDown = (event: MouseEvent) => {
      event.preventDefault();
      canvas.focus();
      flushMove();
      isDragging = true;
      sendMouse(event, "down");
    };

    const onMouseUp = (event: MouseEvent) => {
      if (!isDragging) return;
      flushMove();
      isDragging = event.buttons !== 0;
      sendMouse(event, "up");
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      flushMove();
      let scale = 1;
      if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) scale = WHEEL_LINE_PIXELS;
      else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) scale = canvas.height;
      sendMouse(event, "wheel", { deltaX: event.deltaX * scale, deltaY: event.deltaY * scale });
    };

    const onContextMenu = (event: MouseEvent) => event.preventDefault();

    const onKey = (event: KeyboardEvent) => {
      if (!isConnectedRef.current || event.isComposing || isPasteShortcut(event)) return;
      event.preventDefault();
      send({
        type: "key",
        action: event.type === "keydown" ? "down" : "up",
        key: event.key,
        code: event.code,
        keyCode: event.keyCode,
        modifiers: modifiersFromEvent(event)
      });
    };

    const onPaste = (event: ClipboardEvent) => {
      if (document.activeElement !== canvas || !isConnectedRef.current) return;
      event.preventDefault();
      const text = event.clipboardData?.getData("text/plain") ?? "";
      if (!text) return;
      if (text.length > MAX_PASTE_CHARS) {
        createNotification({
          type: "warning",
          text: `Pasted text is limited to ${MAX_PASTE_CHARS / 1024} KB, so only the start was pasted.`
        });
      }
      send({ type: "text", text: text.slice(0, MAX_PASTE_CHARS) });
    };

    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", onContextMenu);
    canvas.addEventListener("keydown", onKey);
    canvas.addEventListener("keyup", onKey);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    document.addEventListener("paste", onPaste);

    return () => {
      if (moveFrame !== null) cancelAnimationFrame(moveFrame);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onContextMenu);
      canvas.removeEventListener("keydown", onKey);
      canvas.removeEventListener("keyup", onKey);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("paste", onPaste);
    };
  }, [canvasRef, send]);

  const isConnecting = status === "connecting" || (isConnected && !frameSize);

  let statusLabel = "Connecting";
  let statusDotClass = "bg-warning";
  if (isConnected) {
    statusLabel = "Connected";
    statusDotClass = "bg-success";
  } else if (status === "error") {
    statusLabel = `Error: ${error}`;
    statusDotClass = "bg-danger";
  } else if (status === "ended") {
    statusLabel = "Disconnected";
    statusDotClass = "bg-muted";
  }

  return (
    <div className="flex h-dvh w-screen flex-col bg-background">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border bg-card px-2">
        <IconButton
          variant="ghost-muted"
          size="sm"
          aria-label="Back"
          isDisabled={!isConnected || !pageState?.canGoBack}
          onClick={() => send({ type: "back" })}
        >
          <ArrowLeft />
        </IconButton>
        <IconButton
          variant="ghost-muted"
          size="sm"
          aria-label="Forward"
          isDisabled={!isConnected || !pageState?.canGoForward}
          onClick={() => send({ type: "forward" })}
        >
          <ArrowRight />
        </IconButton>
        <IconButton
          variant="ghost-muted"
          size="sm"
          aria-label="Reload"
          isDisabled={!isConnected}
          onClick={() => send({ type: "reload" })}
        >
          <RotateCw />
        </IconButton>
        <div className="relative ml-1 min-w-0 flex-1">
          <Globe className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted" />
          <Input
            aria-label="Page address"
            value={addressDraft ?? pageState?.url ?? ""}
            placeholder={isConnected ? "Enter a URL" : "Not connected"}
            disabled={!isConnected}
            spellCheck={false}
            autoComplete="off"
            className="h-8 pl-8 font-mono text-xs"
            onFocus={(event) => {
              setAddressDraft(pageState?.url ?? "");
              event.currentTarget.select();
            }}
            onChange={(event) => setAddressDraft(event.target.value)}
            onBlur={() => setAddressDraft(null)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                const url = (addressDraft ?? "").trim();
                if (url) send({ type: "navigate", url });
                canvasRef.current?.focus();
              } else if (event.key === "Escape") {
                event.preventDefault();
                canvasRef.current?.focus();
              }
            }}
          />
        </div>
      </div>
      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden bg-background">
        <canvas
          ref={canvasRef}
          tabIndex={0}
          aria-label={`Remote browser for ${account.name}`}
          className="block h-full w-full object-contain outline-none"
          style={{ visibility: frameSize ? "visible" : "hidden" }}
        />
        {isConnecting && (
          <div className="absolute inset-0 z-10">
            <PageLoader text="Opening the web app..." />
          </div>
        )}
        {status === "error" && (
          <WebAccessStatusCard
            overlay
            tone="danger"
            icon={TriangleAlert}
            title="Session failed"
            description={error}
          >
            <Button variant="pam" isFullWidth onClick={reconnect}>
              Reconnect
            </Button>
          </WebAccessStatusCard>
        )}
        {status === "ended" && (
          <DisconnectedScreen
            onReconnect={reconnect}
            description={
              endReason
                ? `${endReason}. Reconnect to start a new session.`
                : "This session has ended. Reconnect to start a new one."
            }
          />
        )}
      </div>
      <div className="flex h-[33px] shrink-0 items-center justify-between border-t border-border bg-card px-3 text-xs">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={`inline-block size-2 shrink-0 rounded-full ${statusDotClass}`} />
          <span className="truncate text-muted">{statusLabel}</span>
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
        <div className="flex min-w-0 items-center gap-4">
          {pageState?.title && <span className="truncate text-muted">{pageState.title}</span>}
          <span className="shrink-0">
            <span className="text-muted">Account:</span>{" "}
            <span className="text-muted">{account.name}</span>
          </span>
        </div>
      </div>
    </div>
  );
};
