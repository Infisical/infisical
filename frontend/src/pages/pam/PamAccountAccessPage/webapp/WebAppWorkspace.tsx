import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Circle, Home, Plus, RotateCw, Square } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
  TextArea
} from "@app/components/v3";
import { useOrganization, useUser } from "@app/context";
import { TPamAccount } from "@app/hooks/api/pam";
import {
  createWebAppSession,
  useEndWebAppSession
} from "@app/hooks/api/pam/web-app-sessions/mutations";
import { useGetWebAppSession } from "@app/hooks/api/pam/web-app-sessions/queries";
import { TWebAppSession } from "@app/hooks/api/pam/web-app-sessions/types";

import { useWebAppSession } from "./useWebAppSession";

const recordingLabel = (state: string) => {
  if (state === "complete") return "Available";
  if (state === "incomplete" || state === "mismatch") return "Partial";
  if (state === "failed" || state === "unavailable") return "Unavailable";
  return "Finalizing";
};
export const WebAppWorkspace = ({
  account,
  reason,
  mfaSessionId,
  initialSessionId
}: {
  account: TPamAccount;
  reason?: string;
  mfaSessionId?: string;
  initialSessionId?: string;
}) => {
  const { currentOrg } = useOrganization();
  const { user } = useUser();
  const launchKey = `pam-web-launch:${currentOrg.id}:${user.id}:${account.id}`;
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [launchError, setLaunchError] = useState<string>();
  const [launchAttempt, setLaunchAttempt] = useState(0);
  const launchPromise = useRef<Promise<TWebAppSession> | null>(null);
  const [address, setAddress] = useState("");
  const [prompt, setPrompt] = useState("");
  const [now, setNow] = useState(Date.now());
  const sessionQuery = useGetWebAppSession(sessionId);
  const session = sessionQuery.data;
  const end = useEndWebAppSession();
  const live = Boolean(
    session &&
    !["ending", "stop-unconfirmed", "stopped", "failed"].includes(session.webApp.workerState) &&
    new Date(session.expiresAt).getTime() > now
  );
  const remote = useWebAppSession(sessionId, live);
  const accountUrl = `/organizations/${currentOrg.id}/pam/accounts/web-app/${account.id}/access`;
  const accountsUrl = `/organizations/${currentOrg.id}/pam/accounts`;
  useEffect(() => {
    if (sessionId) return undefined;
    let cancelled = false;
    let idempotencyKey = sessionStorage.getItem(launchKey);
    if (!idempotencyKey) {
      idempotencyKey = crypto.randomUUID();
      sessionStorage.setItem(launchKey, idempotencyKey);
    }
    if (!launchPromise.current)
      launchPromise.current = createWebAppSession({
        accountId: account.id,
        reason,
        mfaSessionId,
        idempotencyKey
      });
    launchPromise.current
      .then((created) => {
        if (cancelled) return;
        setSessionId(created.id);
        const url = new URL(window.location.href);
        url.searchParams.set("sessionId", created.id);
        window.history.replaceState(window.history.state, "", url);
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setLaunchError(
            (error as { response?: { data?: { message?: string } } }).response?.data?.message ??
              "The app could not be opened. Try again."
          );
      });
    return () => {
      cancelled = true;
    };
  }, [account.id, launchKey, reason, mfaSessionId, sessionId, launchAttempt]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setPrompt(remote.dialog?.defaultPrompt ?? "");
  }, [remote.dialog]);
  const handleEnd = () => {
    if (!sessionId) return;
    remote.control("end");
    end.mutate(sessionId, {
      onError: () =>
        createNotification({
          type: "error",
          text: "The stop request could not be confirmed. Retrying is safe."
        })
    });
  };
  const sessionEnding =
    session &&
    (["ending", "stop-unconfirmed", "stopped", "failed"].includes(session.webApp.workerState) ||
      !live);
  if (sessionEnding) {
    const confirmed = session.webApp.stopConfirmation === "confirmed";
    let title = "Stop Not Yet Confirmed";
    if (confirmed) title = "Browser Stopped";
    else if (session.webApp.workerState === "failed")
      title = "Browser Failed — Stop Not Yet Confirmed";
    else if (
      session.webApp.workerState === "ending" &&
      session.webApp.stopConfirmation === "pending"
    )
      title = "Ending Session";
    return (
      <main className="flex min-h-screen items-center justify-center bg-page p-6">
        <Card className="w-full max-w-xl">
          <CardHeader>
            <CardTitle>{title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p>{account.name}</p>
            <p className="text-sm text-muted">
              {confirmed
                ? "Browser stopped. Work already submitted to the app may continue."
                : "Stopping the browser…"}
            </p>
            {!confirmed && (
              <p className="text-sm">
                Last contact:{" "}
                {session.webApp.lastWorkerContactAt
                  ? new Date(session.webApp.lastWorkerContactAt).toLocaleString()
                  : "Not received"}
                . Enforcement deadline:{" "}
                {session.webApp.leaseUntil
                  ? new Date(
                      Math.min(
                        new Date(session.webApp.leaseUntil).getTime() + 5000,
                        new Date(session.expiresAt).getTime()
                      )
                    ).toLocaleString()
                  : new Date(session.expiresAt).toLocaleString()}
                .
              </p>
            )}
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-muted">End reason</dt>
                <dd>{session.webApp.workerStateReason ?? "Session ended"}</dd>
              </div>
              <div>
                <dt className="text-muted">Recording</dt>
                <dd>{recordingLabel(session.recording.state)}</dd>
              </div>
            </dl>
            {recordingLabel(session.recording.state) === "Finalizing" && (
              <p className="text-sm text-muted">
                Recording is being finalized. You can leave this page.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <a href={accountsUrl}>Back to Accounts</a>
              </Button>
              <Button asChild variant="pam">
                <a href={accountUrl} onClick={() => sessionStorage.removeItem(launchKey)}>
                  Open App Again
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    );
  }
  const error =
    launchError ??
    (sessionQuery.error ? "This browser session could not be loaded." : remote.error);
  const origin = (() => {
    try {
      return new URL(
        remote.surfaces.find((surface) => surface.surfaceSeq === remote.activeSurface)?.url ??
          session?.webApp.startOrigin ??
          ""
      ).origin;
    } catch {
      return session?.webApp.startOrigin ?? "";
    }
  })();
  const remaining = session ? new Date(session.expiresAt).getTime() - now : Infinity;
  let phaseTitle = "Preparing Browser";
  if (remote.phase === "starting-recording") phaseTitle = "Starting Recording";
  if (remote.phase === "opening-app") phaseTitle = "Opening App";
  if (remote.lastFrameAt)
    phaseTitle = remote.connected ? "Updating Live View" : "Connection Lost. Reconnecting…";
  return (
    <main className="flex h-screen min-h-0 flex-col bg-page text-foreground">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-card px-4 py-2">
        <div className="mr-2 min-w-0">
          <p className="truncate text-sm font-medium">{account.name}</p>
          <p className="truncate text-xs text-muted">
            {account.folderName} · {account.templateName}
          </p>
        </div>
        <nav className="flex items-center gap-1" aria-label="Remote browser navigation">
          {[
            { action: "back", label: "Back", Icon: ArrowLeft },
            { action: "forward", label: "Forward", Icon: ArrowRight },
            { action: "reload", label: "Reload", Icon: RotateCw },
            { action: "home", label: "Home", Icon: Home }
          ].map(({ action, label, Icon }) => (
            <Button
              key={action}
              size="sm"
              variant="ghost"
              aria-label={label}
              isDisabled={!remote.ready}
              onClick={() => remote.control("navigate", { action })}
            >
              <Icon className="size-4" />
            </Button>
          ))}
        </nav>
        {session?.webApp.allowTypedNavigation ? (
          <form
            className="min-w-48 flex-1"
            onSubmit={(event) => {
              event.preventDefault();
              remote.control("navigate", { action: "url", url: address });
            }}
          >
            <Input
              aria-label="Remote Address"
              type="url"
              maxLength={2048}
              placeholder={origin}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              disabled={!remote.ready}
            />
          </form>
        ) : (
          <p className="min-w-32 flex-1 truncate text-sm text-muted" title={origin}>
            {origin}
          </p>
        )}
        <span className="flex items-center gap-1.5 text-xs">
          <Circle
            className={`size-2.5 ${remote.recordingHealth?.ok && now - remote.recordingHealth.at < 20_000 ? "fill-danger text-danger" : "text-muted"}`}
          />
          {remote.recordingHealth?.ok && now - remote.recordingHealth.at < 20_000
            ? "Recording"
            : "Recording status pending"}
        </span>
        {session && (
          <time
            className="text-xs"
            dateTime={session.expiresAt}
            title={new Date(session.expiresAt).toISOString()}
          >
            Ends{" "}
            {new Date(session.expiresAt).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit"
            })}
          </time>
        )}
        <Button
          ref={remote.endButtonRef}
          variant="danger"
          size="sm"
          isDisabled={!sessionId}
          isPending={end.isPending}
          onClick={handleEnd}
        >
          <Square className="size-3" />
          End Session
        </Button>
      </header>
      <nav
        aria-label="Remote tabs"
        className="flex shrink-0 gap-1 overflow-x-auto border-b border-border px-3 py-1"
      >
        {remote.surfaces.map((surface) => (
          <Button
            key={surface.surfaceSeq}
            size="sm"
            variant={surface.surfaceSeq === remote.activeSurface ? "outline" : "ghost"}
            onClick={() => {
              if (surface.surfaceSeq !== remote.activeSurface)
                remote.control("surface", { action: "activate", surfaceSeq: surface.surfaceSeq });
            }}
            aria-current={surface.surfaceSeq === remote.activeSurface ? "page" : undefined}
          >
            {surface.title || "Remote Tab"}
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => remote.control("surface", { action: "new" })}
          isDisabled={!remote.connected || remote.busy}
        >
          <Plus className="size-3" />
          New Remote Tab
        </Button>
      </nav>
      <div
        role="status"
        aria-live="polite"
        className="shrink-0 space-y-1 border-b border-border px-4 py-2 text-xs text-muted"
      >
        <p>Session screens and input are recorded. Authorized reviewers can replay this session.</p>
        {remote.lastFrameAt && (
          <p>
            Last image: {new Date(remote.lastFrameAt).toLocaleTimeString()}.
            {!remote.ready &&
              (remote.connected ? " Updating the live view…" : " Connection lost. Reconnecting…")}
          </p>
        )}
        {remaining <= 300_000 && (
          <p className="text-warning">
            {remaining <= 60_000
              ? "This session ends in less than one minute."
              : "This session ends in less than five minutes."}
          </p>
        )}
        {error && <p className="text-danger">{error}</p>}
        {remote.blocked.length > 0 && (
          <details>
            <summary>Blocked Destinations ({remote.blocked.length})</summary>
            <ul>
              {remote.blocked.map((destination) => (
                <li key={destination}>{destination}</li>
              ))}
            </ul>
          </details>
        )}
      </div>
      <div
        ref={remote.containerRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-background"
      >
        <canvas
          ref={remote.canvasRef}
          {...remote.canvasHandlers}
          aria-label="Remote Web App"
          className="max-h-full max-w-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <TextArea
          ref={remote.keyboardRef}
          {...remote.keyboardHandlers}
          aria-label="Remote Web App keyboard. Tab returns to local controls. Control Alt Escape focuses End Session."
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className="absolute bottom-0 left-0 h-px min-h-0 w-px resize-none overflow-hidden p-0 opacity-0"
        />
        {(!remote.ready || error || remote.busy) && !remote.dialog && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/85 p-6">
            <div className="max-w-xl space-y-4">
              {remote.busy && (
                <>
                  <h1 className="font-alliance text-xl">Another Tab Controls This Browser</h1>
                  <Button variant="pam" onClick={remote.takeControl}>
                    Take Control Here
                  </Button>
                </>
              )}
              {!remote.busy && error && (
                <>
                  <h1 className="font-alliance text-xl">Browser Connection Unavailable</h1>
                  <p className="text-sm">{error}</p>
                  <Button
                    onClick={() => {
                      if (launchError) {
                        launchPromise.current = null;
                        setLaunchError(undefined);
                        setLaunchAttempt((value) => value + 1);
                      } else remote.reconnect();
                    }}
                    variant="pam"
                  >
                    Retry
                  </Button>
                </>
              )}
              {!remote.busy && !error && (
                <>
                  <h1 className="flex items-center gap-2 font-alliance text-xl">
                    <Spinner size="sm" />
                    {phaseTitle}
                  </h1>
                  <p className="text-sm text-muted">The app opens after recording is ready.</p>
                </>
              )}
              {sessionId ? (
                <Button variant="outline" onClick={handleEnd}>
                  Cancel Launch
                </Button>
              ) : (
                <Button asChild variant="outline">
                  <a href={accountsUrl}>Back to Accounts</a>
                </Button>
              )}
              <p className="text-xs text-muted">
                Closing this tab leaves the app running briefly so you can reconnect. Pixel
                streaming does not expose the app to a screen reader.
              </p>
            </div>
          </div>
        )}
      </div>
      <Dialog
        open={Boolean(remote.dialog)}
        onOpenChange={(open) => {
          if (!open) remote.answerDialog(remote.dialog?.type === "alert");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remote App Dialog</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="mb-3 text-sm whitespace-pre-wrap">{remote.dialog?.message}</p>
            {remote.dialog?.type === "prompt" && (
              <Input
                aria-label="Reply to the remote app"
                value={prompt}
                maxLength={4096}
                onChange={(event) => setPrompt(event.target.value)}
              />
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant="danger" onClick={handleEnd}>
              End Session
            </Button>
            {remote.dialog?.type !== "alert" && (
              <Button variant="outline" onClick={() => remote.answerDialog(false)}>
                Cancel
              </Button>
            )}
            <Button
              variant="pam"
              onClick={() =>
                remote.answerDialog(true, remote.dialog?.type === "prompt" ? prompt : undefined)
              }
            >
              OK
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
};
