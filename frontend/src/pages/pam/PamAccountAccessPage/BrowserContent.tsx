import { MutableRefObject, RefObject, useEffect, useState } from "react";
import { Ban, TriangleAlert, XIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertTitle,
  Button,
  IconButton,
  Input,
  PageLoader
} from "@app/components/v3";
import { TPamAccount } from "@app/hooks/api/pam";

import {
  BrowserDialogKind,
  BrowserEndReason,
  BrowserKeyAction,
  BrowserMouseAction,
  BrowserMouseButton,
  encodeKey,
  encodeMouse,
  encodeText,
  encodeWheel,
  getHeldButtonsMask,
  getModifierMask,
  getMoveButton,
  MAX_TEXT_INPUT_BYTES,
  TBrowserDialogMessage,
  TBrowserViewport,
  toBrowserMouseButton,
  toViewportPoint,
  truncateUtf8,
  wheelDeltaToPixels
} from "./browser-protocol";
import { DisconnectedScreen } from "./DisconnectedScreen";
import { BrowserSessionStatus, TBrowserSessionEnd, useBrowserSession } from "./useBrowserSession";
import { WebAccessStatusCard } from "./WebAccessStatusCard";

const BLOCKED_NOTICE_DURATION_MS = 6000;

const END_REASON_DESCRIPTIONS: Record<string, string> = {
  [BrowserEndReason.Completed]: "Session ended: the maximum session duration was reached.",
  [BrowserEndReason.Expired]: "Session ended: your access to this account expired.",
  [BrowserEndReason.Terminated]: "Your access was revoked or an admin ended this session.",
  [BrowserEndReason.Idle]: "Session ended after a period of inactivity.",
  [BrowserEndReason.UserQuit]: "You ended this session.",
  [BrowserEndReason.BrowserStopped]: "The remote browser stopped unexpectedly.",
  [BrowserEndReason.Capacity]:
    "No browser capacity is available on this gateway. Try again shortly.",
  [BrowserEndReason.Error]: "The remote browser reported an error and the session ended."
};

const getEndDescription = ({ reason, message }: TBrowserSessionEnd) => {
  if (reason === BrowserEndReason.Error && message) {
    return `The remote browser reported an error: ${message}`;
  }
  const known: string | undefined = reason ? END_REASON_DESCRIPTIONS[reason] : undefined;
  if (known) return known;
  if (message) return message;
  return reason ? "This session has ended." : "The connection to the remote browser was lost.";
};

const getHost = (url: string) => {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
};

const getKeyText = (event: KeyboardEvent) => {
  if (Array.from(event.key).length !== 1) return undefined;
  // Ctrl and Meta chords are shortcuts, not typing; AltGr reports as Ctrl+Alt on Windows
  if ((event.ctrlKey || event.metaKey) && !event.getModifierState("AltGraph")) return undefined;
  return event.key;
};

const isPasteShortcut = (event: KeyboardEvent) =>
  ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "v") ||
  (event.shiftKey && event.key === "Insert");

type TCanvasInputOptions = {
  canvasRef: RefObject<HTMLCanvasElement>;
  viewportRef: MutableRefObject<TBrowserViewport | null>;
  send: (message: Uint8Array) => void;
  isEnabled: boolean;
};

const useCanvasInput = ({ canvasRef, viewportRef, send, isEnabled }: TCanvasInputOptions) => {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isEnabled) return undefined;

    let pendingMove: MouseEvent | null = null;
    let moveFrame = 0;
    const heldKeys = new Map<string, { key: string; code: string; keyCode: number }>();

    const getPoint = (event: MouseEvent) => {
      const viewport = viewportRef.current;
      const rect = canvas.getBoundingClientRect();
      if (!viewport || !rect.width || !rect.height) return null;
      return toViewportPoint(event.clientX, event.clientY, rect, viewport);
    };

    const sendMouse = (
      event: MouseEvent,
      action: BrowserMouseAction,
      button: BrowserMouseButton
    ) => {
      const point = getPoint(event);
      if (!point) return;
      send(
        encodeMouse({
          action,
          ...point,
          button,
          buttons: getHeldButtonsMask(event.buttons),
          clickCount: action === BrowserMouseAction.Move ? 0 : event.detail,
          modifiers: getModifierMask(event)
        })
      );
    };

    // A down, up or wheel must land where the pointer is, so any move still waiting goes first
    const flushMove = () => {
      if (moveFrame) cancelAnimationFrame(moveFrame);
      moveFrame = 0;
      if (!pendingMove) return;
      sendMouse(pendingMove, BrowserMouseAction.Move, getMoveButton(pendingMove.buttons));
      pendingMove = null;
    };

    const handleMouseMove = (event: MouseEvent) => {
      pendingMove = event;
      if (!moveFrame) moveFrame = requestAnimationFrame(flushMove);
    };

    const handlePointerDown = (event: PointerEvent) => {
      // Keeps mouse events on the canvas while a drag leaves it, so the release still arrives
      canvas.setPointerCapture(event.pointerId);
    };

    const handleMouseDown = (event: MouseEvent) => {
      // Default handling would select text and start middle-click autoscroll in this tab
      event.preventDefault();
      canvas.focus({ preventScroll: true });
      const button = toBrowserMouseButton(event.button);
      if (!button) return;
      flushMove();
      sendMouse(event, BrowserMouseAction.Down, button);
    };

    const handleMouseUp = (event: MouseEvent) => {
      const button = toBrowserMouseButton(event.button);
      if (!button) return;
      flushMove();
      sendMouse(event, BrowserMouseAction.Up, button);
    };

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const viewport = viewportRef.current;
      const point = getPoint(event);
      if (!viewport || !point) return;
      flushMove();
      send(
        encodeWheel({
          ...point,
          deltaX: wheelDeltaToPixels(event.deltaX, event.deltaMode, viewport.height),
          deltaY: wheelDeltaToPixels(event.deltaY, event.deltaMode, viewport.height),
          modifiers: getModifierMask(event)
        })
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      // The paste shortcut is left to this browser so it fires `paste` with the local clipboard
      if (event.isComposing || isPasteShortcut(event)) return;
      event.preventDefault();
      flushMove();
      const key = { key: event.key, code: event.code, keyCode: event.keyCode };
      heldKeys.set(event.code || event.key, key);
      send(
        encodeKey({
          action: BrowserKeyAction.Down,
          ...key,
          modifiers: getModifierMask(event),
          text: getKeyText(event)
        })
      );
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!heldKeys.delete(event.code || event.key)) return;
      event.preventDefault();
      send(
        encodeKey({
          action: BrowserKeyAction.Up,
          key: event.key,
          code: event.code,
          keyCode: event.keyCode,
          modifiers: getModifierMask(event)
        })
      );
    };

    // Keys held when focus leaves (Alt+Tab, a page dialog opening) would stay down remotely
    const handleBlur = () => {
      heldKeys.forEach((key) =>
        send(encodeKey({ action: BrowserKeyAction.Up, ...key, modifiers: 0 }))
      );
      heldKeys.clear();
    };

    // Chrome targets `paste` at the selection or body rather than the focused canvas
    const handlePaste = (event: ClipboardEvent) => {
      if (document.activeElement !== canvas) return;
      event.preventDefault();
      const text = event.clipboardData?.getData("text/plain");
      if (!text) return;
      const clipped = truncateUtf8(text, MAX_TEXT_INPUT_BYTES);
      if (clipped.length < text.length) {
        createNotification({
          type: "warning",
          text: "Pasted text was cut to 32 KiB, the most one paste can send."
        });
      }
      send(encodeText(clipped));
    };

    const handleContextMenu = (event: MouseEvent) => event.preventDefault();

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    canvas.addEventListener("keydown", handleKeyDown);
    canvas.addEventListener("keyup", handleKeyUp);
    canvas.addEventListener("blur", handleBlur);
    canvas.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("paste", handlePaste);

    return () => {
      if (moveFrame) cancelAnimationFrame(moveFrame);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("keydown", handleKeyDown);
      canvas.removeEventListener("keyup", handleKeyUp);
      canvas.removeEventListener("blur", handleBlur);
      canvas.removeEventListener("contextmenu", handleContextMenu);
      document.removeEventListener("paste", handlePaste);
    };
  }, [canvasRef, viewportRef, send, isEnabled]);
};

type BrowserPageDialogProps = {
  dialog: TBrowserDialogMessage;
  pageUrl: string;
  onReply: (accept: boolean, promptText?: string) => void;
};

const BrowserPageDialog = ({ dialog, pageUrl, onReply }: BrowserPageDialogProps) => {
  const [promptText, setPromptText] = useState(dialog.defaultPrompt ?? "");
  const isAlert = dialog.kind === BrowserDialogKind.Alert;
  const isPrompt = dialog.kind === BrowserDialogKind.Prompt;
  const isBeforeUnload = dialog.kind === BrowserDialogKind.BeforeUnload;

  const title = isBeforeUnload ? "Leave Page?" : `${pageUrl ? getHost(pageUrl) : "This page"} says`;
  const description =
    isBeforeUnload && !dialog.message ? "Changes you made may not be saved." : dialog.message;

  const accept = () => onReply(true, isPrompt ? promptText : undefined);

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        // Escape answers like Cancel; an alert has only OK
        if (!open) onReply(isAlert);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-wrap [overflow-wrap:anywhere]">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {isPrompt && (
          <Input
            aria-label="Response"
            value={promptText}
            onChange={(event) => setPromptText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              accept();
            }}
          />
        )}
        <AlertDialogFooter>
          {!isAlert && (
            <AlertDialogCancel onClick={() => onReply(false)}>
              {isBeforeUnload ? "Stay" : "Cancel"}
            </AlertDialogCancel>
          )}
          <AlertDialogAction variant="pam" onClick={accept}>
            {isBeforeUnload ? "Leave" : "OK"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

const BlockedNavigationNotice = ({ url, onDismiss }: { url: string; onDismiss: () => void }) => (
  <div className="absolute top-3 left-1/2 z-20 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 rounded-md bg-popover shadow-md">
    <Alert variant="warning" className="pr-10">
      <Ban />
      <AlertTitle>Navigation Blocked</AlertTitle>
      <AlertDescription className="[overflow-wrap:anywhere]">
        {getHost(url)} is not an allowed host for this account.
      </AlertDescription>
      <IconButton
        variant="ghost"
        size="xs"
        aria-label="Dismiss notice"
        className="absolute top-1.5 right-1.5 text-current"
        onClick={onDismiss}
      >
        <XIcon />
      </IconButton>
    </Alert>
  </div>
);

type BrowserContentProps = {
  account: TPamAccount;
  reason?: string;
  mfaSessionId?: string;
};

export const BrowserContent = ({ account, reason, mfaSessionId }: BrowserContentProps) => {
  const {
    containerRef,
    canvasRef,
    viewportRef,
    status,
    error,
    sessionEnd,
    page,
    dialog,
    blockedNavigation,
    isEnding,
    send,
    endSession,
    replyToDialog,
    dismissBlockedNavigation,
    reconnect
  } = useBrowserSession({ accountId: account.id, reason, mfaSessionId });

  const isConnected = status === BrowserSessionStatus.Connected;

  useCanvasInput({ canvasRef, viewportRef, send, isEnabled: isConnected });

  useEffect(() => {
    if (!blockedNavigation) return undefined;
    const timer = setTimeout(dismissBlockedNavigation, BLOCKED_NOTICE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [blockedNavigation, dismissBlockedNavigation]);

  let statusLabel = "Connecting";
  let statusDotClass = "bg-warning";
  if (isConnected) {
    statusLabel = isEnding ? "Ending session" : "Connected";
    statusDotClass = "bg-success";
  } else if (status === BrowserSessionStatus.Error) {
    statusLabel = "Connection failed";
    statusDotClass = "bg-danger";
  } else if (status === BrowserSessionStatus.Ended) {
    statusLabel = "Session ended";
    statusDotClass = "bg-muted";
  }

  return (
    <div className="flex h-dvh w-screen flex-col bg-background">
      <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden">
        <canvas
          ref={canvasRef}
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- It takes keyboard input for the remote page.
          tabIndex={0}
          role="application"
          aria-label={`Remote browser for ${account.name}`}
          className="absolute inset-0 size-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        />
        {status === BrowserSessionStatus.Connecting && (
          <div className="absolute inset-0 z-10">
            <PageLoader text="Starting remote browser..." />
          </div>
        )}
        {isConnected && blockedNavigation && (
          <BlockedNavigationNotice
            key={blockedNavigation.id}
            url={blockedNavigation.url}
            onDismiss={dismissBlockedNavigation}
          />
        )}
        {status === BrowserSessionStatus.Error && (
          <WebAccessStatusCard
            overlay
            tone="danger"
            icon={TriangleAlert}
            title="Connection Failed"
            description={error}
          >
            <Button variant="pam" isFullWidth onClick={reconnect}>
              Reconnect
            </Button>
          </WebAccessStatusCard>
        )}
        {status === BrowserSessionStatus.Ended && (
          <DisconnectedScreen
            onReconnect={reconnect}
            title={
              sessionEnd?.reason === BrowserEndReason.Capacity
                ? "Browser Unavailable"
                : "Session Ended"
            }
            description={getEndDescription(sessionEnd ?? {})}
          />
        )}
      </div>
      <div className="flex h-[33px] shrink-0 items-center gap-4 border-t border-border bg-card px-3 text-xs">
        <span className="flex shrink-0 items-center gap-1.5">
          <span className={`inline-block size-2 rounded-full ${statusDotClass}`} />
          <span className="text-muted">{statusLabel}</span>
          {isConnected && (
            <Button
              variant="text"
              size="xs"
              className="ml-2 text-muted hover:text-danger"
              isDisabled={isEnding}
              onClick={endSession}
            >
              End Session
            </Button>
          )}
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-2" title={page.url}>
          {page.title && <span className="truncate text-foreground">{page.title}</span>}
          {page.url && <span className="truncate font-mono text-muted">{page.url}</span>}
        </span>
        <span className="shrink-0">
          <span className="text-muted">Account:</span>{" "}
          <span className="text-muted">{account.name}</span>
        </span>
      </div>
      {isConnected && dialog && (
        <BrowserPageDialog
          key={dialog.id}
          dialog={dialog}
          pageUrl={page.url}
          onReply={replyToDialog}
        />
      )}
    </div>
  );
};
